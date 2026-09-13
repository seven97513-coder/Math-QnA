'use client';

import { useState } from 'react';
import { auth, db } from '@/lib/firebase/client';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      if (user) {
        const idTokenResult = await user.getIdTokenResult(true);
        let role = idTokenResult.claims.role as string | undefined;

        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDocRef);
          if (!userSnap.exists()) {
            await setDoc(userDocRef, {
              uid: user.uid,
              email: user.email,
              name: user.displayName || '이름 없음',
              photoURL: user.photoURL || '',
              role: 'pending',
              createdAt: serverTimestamp(),
            });
          } else {
            role = role || userSnap.data()?.role;
          }
        } catch (dbErr) {
          console.warn('User doc sync error:', dbErr);
        }

        if (role === 'teacher') {
          router.push('/teacher');
        } else if (role === 'student') {
          router.push('/board/algebra');
        } else {
          router.push('/pending');
        }
      }
    } catch (error: any) {
      console.error('Login failed', error);
      if (error.code === 'auth/popup-closed-by-user') {
        return;
      }
      if (error.code === 'auth/operation-not-allowed') {
        setErrorMsg('Firebase 콘솔의 Authentication > Sign-in method에서 [Google] 제공업체를 활성화해야 합니다.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setErrorMsg('Firebase 콘솔 Authentication > Settings > 승인된 도메인에 현재 도메인(localhost)을 추가해야 합니다.');
      } else {
        setErrorMsg(`로그인에 실패했습니다: ${error.message || error.code || '오류가 발생했습니다.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">수학 질문 카페</h1>
        <p className="text-gray-600 mb-6">학교 계정으로 로그인해 주세요.</p>
        
        {errorMsg && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded text-left">
            <p className="font-semibold mb-1">로그인 안내</p>
            <p>{errorMsg}</p>
          </div>
        )}

        <Button
          onClick={handleLogin}
          disabled={loading}
          className="w-full text-base h-12 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.02 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          {loading ? '로그인 처리 중...' : 'Google 계정으로 로그인'}
        </Button>
      </div>
    </div>
  );
}
