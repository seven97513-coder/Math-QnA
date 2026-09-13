import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import {
  AdminConfigError,
  AuthError,
  getAdminAuth,
  getAdminDb,
  verifyCaller,
} from '@/lib/firebase/admin';

export const maxDuration = 30;

/**
 * FR-102: 최초 교사 계정은 환경변수 TEACHER_EMAILS에 등록된 이메일로 자동 부여한다.
 *
 * 화면에서 스스로 교사가 되는 버튼은 두지 않는다. 허용 목록은 서버 환경변수에만 있고
 * 학생은 건드릴 수 없으므로, 같은 동작이라도 이쪽은 승격 경로가 아니다.
 */
export async function POST(req: Request) {
  try {
    const caller = await verifyCaller(req);

    const allowed = (process.env.TEACHER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowed.length === 0) {
      return NextResponse.json(
        { message: 'TEACHER_EMAILS가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    const email = caller.email?.toLowerCase();
    if (!email || !allowed.includes(email)) {
      // 허용 목록의 내용을 알려 주지 않는다
      return NextResponse.json({ message: '교사로 등록된 계정이 아닙니다.' }, { status: 403 });
    }

    if (caller.role === 'teacher') {
      return NextResponse.json({ ok: true, alreadyTeacher: true });
    }

    await getAdminAuth().setCustomUserClaims(caller.uid, { role: 'teacher' });
    await getAdminDb().collection('users').doc(caller.uid).set(
      {
        uid: caller.uid,
        email: caller.email,
        role: 'teacher',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await getAdminDb().collection('auditLogs').add({
      actorUid: caller.uid,
      actorEmail: caller.email,
      action: 'bootstrapTeacher',
      targetUid: caller.uid,
      before: { role: caller.role },
      after: { role: 'teacher' },
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof AdminConfigError) {
      console.error('[admin/bootstrap]', error.message);
      return NextResponse.json(
        { message: '서버에 FIREBASE_SERVICE_ACCOUNT가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }
    console.error('[admin/bootstrap] unexpected error', error);
    return NextResponse.json({ message: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
