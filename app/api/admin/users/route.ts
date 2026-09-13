import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import {
  AdminConfigError,
  AuthError,
  getAdminAuth,
  getAdminDb,
  requireTeacher,
  type Caller,
  type Role,
} from '@/lib/firebase/admin';

export const maxDuration = 30;

type Action = 'approve' | 'setRole' | 'block' | 'unblock';

function bad(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

/**
 * NFR-10 감사: 역할 변경·차단·삭제는 auditLogs에 남긴다.
 * 보안 규칙은 이 컬렉션의 클라이언트 쓰기를 막고 있으므로 Admin SDK로만 기록된다.
 */
async function writeAuditLog(
  actor: Caller,
  action: string,
  targetUid: string,
  before: unknown,
  after: unknown,
) {
  await getAdminDb().collection('auditLogs').add({
    actorUid: actor.uid,
    actorEmail: actor.email,
    action,
    targetUid,
    before,
    after,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * FR-102: 역할은 users 문서와 커스텀 클레임 **양쪽**에 반영한다.
 * 클레임만 바꾸면 화면이 모르고, 문서만 바꾸면 보안 규칙이 매번 문서를 읽어야 한다.
 */
async function applyRole(uid: string, role: Role) {
  await getAdminAuth().setCustomUserClaims(uid, { role });
  await getAdminDb().collection('users').doc(uid).update({
    role,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function POST(req: Request) {
  try {
    const actor = await requireTeacher(req);

    const body = await req.json().catch(() => ({}));
    const action = body.action as Action | undefined;
    const targetUid = body.targetUid as string | undefined;

    if (!targetUid || typeof targetUid !== 'string') {
      return bad(400, '대상 사용자가 지정되지 않았습니다.');
    }

    // 자기 자신의 권한을 내리거나 스스로를 차단하면 아무도 승인할 수 없게 된다.
    if (targetUid === actor.uid && action !== 'approve') {
      return bad(400, '본인의 권한은 이 화면에서 바꿀 수 없습니다.');
    }

    const targetRef = getAdminDb().collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return bad(404, '사용자를 찾을 수 없습니다.');

    const before = targetSnap.data()!;

    switch (action) {
      case 'approve': {
        // FR-102: 승인하면서 학년·반·번호를 지정한다
        const classNo = Number(body.classNo);
        const studentNo = Number(body.studentNo);

        if (!Number.isInteger(classNo) || classNo < 1 || classNo > 12) {
          return bad(400, '반은 1~12 사이여야 합니다.');
        }
        if (!Number.isInteger(studentNo) || studentNo < 1 || studentNo > 40) {
          return bad(400, '번호는 1~40 사이여야 합니다.');
        }

        await targetRef.update({
          grade: 3, // 현재 학년은 3 고정 (OPEN QUESTIONS 3번)
          classNo,
          studentNo,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await applyRole(targetUid, 'student');
        await writeAuditLog(actor, 'approve', targetUid, { role: before.role }, {
          role: 'student',
          classNo,
          studentNo,
        });
        break;
      }

      case 'setRole': {
        const role = body.role as Role | undefined;
        if (role !== 'student' && role !== 'teacher' && role !== 'pending') {
          return bad(400, '역할 값이 올바르지 않습니다.');
        }
        await applyRole(targetUid, role);
        await writeAuditLog(actor, 'setRole', targetUid, { role: before.role }, { role });
        break;
      }

      case 'block':
      case 'unblock': {
        // FR-103: 차단은 즉시 효력이 있어야 하므로 클레임이 아니라 문서에 둔다.
        // 클레임은 토큰이 갱신될 때까지 최대 1시간 남아 있다.
        const isBlocked = action === 'block';
        await targetRef.update({ isBlocked, updatedAt: FieldValue.serverTimestamp() });
        await writeAuditLog(
          actor,
          action,
          targetUid,
          { isBlocked: before.isBlocked === true },
          { isBlocked },
        );
        break;
      }

      default:
        return bad(400, '알 수 없는 요청입니다.');
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[admin/users] unexpected error', error);
    const message = error?.message || '처리 중 오류가 발생했습니다.';
    const status =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    return bad(status, message);
  }
}
