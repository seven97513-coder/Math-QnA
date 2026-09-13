'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase/client';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function PendingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const currentRole = userDoc.data()?.role;
          setRole(currentRole);
          if (currentRole === 'teacher' || currentRole === 'student') {
            router.push('/board/algebra');
            return;
          }
        }
      } catch (err) {
        console.error('Error fetching user doc:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleRegisterAsTeacher = async () => {
    if (!user) return;
    try {
      setUpdating(true);
      const userRef = doc(db, 'users', user.uid);
      await setDoc(
        userRef,
        {
          uid: user.uid,
          email: user.email,
          name: user.displayName || '선생님',
          role: 'teacher',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert('교사 권한이 성공적으로 설정되었습니다! 질문 게시판으로 이동합니다.');
      router.push('/board/algebra');
    } catch (err: any) {
      console.error('Failed to set teacher role:', err);
      alert(`교사 권한 설정 실패: ${err.message || '오류가 발생했습니다.'}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-500">사용자 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ⏳
        </div>
        <h1 className="text-2xl font-bold mb-2">가입 승인 대기 중</h1>
        <p className="text-sm text-gray-500 mb-4">
          로그인 계정: <span className="font-medium text-gray-800">{user?.email}</span>
        </p>

        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          학생 계정은 담당 선생님의 승인 후 서비스 이용이 가능합니다.
        </p>

        <div className="border-t border-gray-100 pt-6 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-4">
            <p className="text-sm font-semibold text-blue-900 mb-1">👩‍🏫 교사/관리자이신가요?</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              본인이 담당 교사라면 아래 버튼을 눌러 교사 권한을 활성화하고 즉시 게시판 및 관리 기능을 이용할 수 있습니다.
            </p>
          </div>

          <Button
            onClick={handleRegisterAsTeacher}
            disabled={updating}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 h-auto"
          >
            {updating ? '교사 권한 등록 중...' : '교사(관리자) 권한 활성화'}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={handleLogout} className="w-full">
            다른 계정으로 로그인
          </Button>
        </div>
      </div>
    </div>
  );
}
