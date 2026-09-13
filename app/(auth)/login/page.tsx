'use client';

import { auth } from '@/lib/firebase/client';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      
      // Force token refresh to get custom claims (role)
      const user = auth.currentUser;
      if (user) {
        const idTokenResult = await user.getIdTokenResult(true);
        const role = idTokenResult.claims.role;
        
        if (role === 'pending' || !role) {
          router.push('/pending');
        } else if (role === 'teacher') {
          router.push('/teacher');
        } else {
          router.push('/board/algebra');
        }
      }
    } catch (error) {
      console.error('Login failed', error);
      alert('로그인에 실패했습니다.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold mb-6">수학 질문 카페</h1>
        <p className="text-gray-600 mb-8">학교 계정으로 로그인해 주세요.</p>
        <Button
          onClick={handleLogin}
          className="w-full text-lg h-12"
        >
          Google 계정으로 로그인
        </Button>
      </div>
    </div>
  );
}
