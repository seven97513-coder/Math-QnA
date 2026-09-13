import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { errorMessage } from '@/lib/utils';
import fs from 'fs';
import path from 'path';

// firebase-admin v14는 네임스페이스 API(admin.apps / admin.auth())를 제공하지 않는다.
// 서비스별 모듈 진입점만 사용한다.

/** 서비스 계정 키가 없거나 깨졌을 때. 라우트가 잡아서 안내 문구로 바꾼다. */
export class AdminConfigError extends Error {}

function createApp(): App {
  let serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountString) {
    const localFilePath = path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(localFilePath)) {
      try {
        serviceAccountString = fs.readFileSync(localFilePath, 'utf-8');
      } catch (err) {
        console.warn('Failed to read local service-account.json:', err);
      }
    }
  }

  if (!serviceAccountString) {
    throw new AdminConfigError(
      'FIREBASE_SERVICE_ACCOUNT 환경변수가 비어있습니다. Vercel에서 환경 변수 추가 후 최신 버전으로 Redeploy(재배포)했는지 확인해주세요.',
    );
  }

  let json: Record<string, unknown>;
  try {
    let raw = serviceAccountString.trim();

    // 1. Base64 인코딩된 문자열인 경우 복원
    if (!raw.startsWith('{') && !raw.startsWith('"')) {
      try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        if (decoded.trim().startsWith('{')) {
          raw = decoded.trim();
        }
      } catch {}
    }

    // 2. 전체가 큰따옴표로 감싸진 경우 unwrap
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = JSON.parse(raw);
    }
    json = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new AdminConfigError(`FIREBASE_SERVICE_ACCOUNT JSON 형식 오류: ${errorMessage(e)}`);
  }

  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

  // 프로젝트 ID를 코드에 박아 두지 않는다. 폴백이 있으면 키가 잘못돼도
  // 엉뚱한 프로젝트로 조용히 붙는다 (client.ts와 같은 이유).
  const projectId = str(json.project_id) ?? str(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = str(json.client_email);
  const privateKey = str(json.private_key)?.replace(/\\n/g, '\n').replace(/\r/g, '');

  if (!projectId || !clientEmail || !privateKey) {
    throw new AdminConfigError(
      'FIREBASE_SERVICE_ACCOUNT에 project_id·client_email·private_key가 모두 있어야 합니다.',
    );
  }

  const serviceAccount = { projectId, clientEmail, privateKey };

  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ?? `${serviceAccount.projectId}.firebasestorage.app`,
  });
}

// 모듈 로드 시점이 아니라 첫 호출 시점에 초기화한다.
// 최상위에서 던지면 라우트 자체가 임포트에 실패해 원인 없는 500만 남는다.
function adminApp(): App {
  return getApps()[0] ?? createApp();
}

export function getAdminAuth() {
  return getAuth(adminApp());
}

export function getAdminDb() {
  return getFirestore(adminApp());
}

export function getAdminStorage() {
  return getStorage(adminApp());
}

export type Role = 'student' | 'teacher' | 'pending';

export type Caller = {
  uid: string;
  email: string | null;
  role: Role;
  isBlocked: boolean;
};

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * ID 토큰을 검증하고 역할까지 확정한다.
 * 커스텀 클레임이 우선이고, 없으면 users 문서를 본다(보안 규칙의 role()과 같은 순서).
 */
export async function verifyCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError(401, '로그인이 필요합니다.');
  }

  const decoded = await getAdminAuth()
    .verifyIdToken(authHeader.slice('Bearer '.length))
    .catch(() => {
      throw new AuthError(401, '로그인이 만료되었습니다. 다시 로그인해 주세요.');
    });

  const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
  const data = snap.data();

  const claimRole = decoded.role as Role | undefined;
  const role: Role = claimRole ?? (data?.role as Role | undefined) ?? 'pending';

  return {
    uid: decoded.uid,
    email: decoded.email ?? data?.email ?? null,
    role,
    isBlocked: data?.isBlocked === true,
  };
}

/** 교사 전용 라우트의 관문 */
export async function requireTeacher(req: Request): Promise<Caller> {
  const caller = await verifyCaller(req);
  if (caller.role !== 'teacher' || caller.isBlocked) {
    // 교사 화면의 존재를 굳이 알리지 않는다
    throw new AuthError(404, '찾을 수 없습니다.');
  }
  return caller;
}
