import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// firebase-admin v14는 네임스페이스 API(admin.apps / admin.auth())를 제공하지 않는다.
// 서비스별 모듈 진입점만 사용한다.

function createApp(): App {
  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountString) {
    // 여기서 던지지 않으면 인증 없는 Admin 클라이언트가 만들어져
    // 실패 지점이 요청 처리 한복판으로 밀린다. 부팅 시점에 드러나게 둔다.
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  }

  // Google이 내려주는 키 파일은 snake_case, cert()의 타입은 camelCase다. 명시적으로 옮긴다.
  const json = JSON.parse(serviceAccountString) as Record<string, string>;
  const serviceAccount = {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key,
  };

  return initializeApp({
    credential: cert(serviceAccount),
    // getStorage().bucket()은 기본 버킷 이름이 주입돼 있어야 동작한다 (FR-301 사진 판독).
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ?? `${serviceAccount.projectId}.firebasestorage.app`,
  });
}

const app = getApps()[0] ?? createApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
