'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/client';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        let role = token.claims.role as string | undefined;

        if (!role) {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          role = userSnap.data()?.role;
        }

        if (role === 'teacher') {
          router.replace('/teacher');
        } else if (role === 'student') {
          router.replace('/board/algebra');
        } else {
          router.replace('/pending');
        }
      } catch {
        router.replace('/login');
      }
    });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-gray-400 text-sm animate-pulse">페이지 이동 중...</div>
    </div>
  );
}
