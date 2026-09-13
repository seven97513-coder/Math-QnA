'use client';

import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { auth, db } from '@/lib/firebase/client';

/**
 * 교사 화면 가드.
 * 이건 화면 편의일 뿐이고 실제 차단은 firestore.rules와 서버 라우트가 한다(PRD 0.2 규칙 2).
 */
export default function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'allowed'>('checking');

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      // 클레임이 이미 있으면 문서를 읽지 않는다
      const token = await user.getIdTokenResult();
      let role = token.claims.role as string | undefined;

      if (!role) {
        const snap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
        role = snap?.data()?.role;
      }

      if (role === 'teacher') {
        setState('allowed');
      } else {
        router.replace(role === 'student' ? '/board/algebra' : '/pending');
      }
    });
  }, [router]);

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-base text-gray-500">권한 확인 중...</p>
      </div>
    );
  }

  return <>{children}</>;
}
