'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function PendingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');

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
          if (currentRole === 'teacher') {
            router.push('/teacher');
            return;
          } else if (currentRole === 'student') {
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

  const handleTeacherBootstrap = async () => {
    if (!user) return;
    setBootstrapping(true);
    setBootstrapError('');
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBootstrapError(data.message ?? '권한 활성화에 실패했습니다.');
        return;
      }

      // 커스텀 클레임이 방금 바뀌었으므로 토큰을 강제로 새로 받는다
      await user.getIdToken(true);
      router.push('/teacher/users');
    } catch {
      setBootstrapError('서버에 연결하지 못했습니다.');
    } finally {
      setBootstrapping(false);
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

        {/*
          FR-102: 교사 권한은 화면이 아니라 서버 환경변수 TEACHER_EMAILS가 결정한다.
          버튼을 누르면 서버가 로그인한 이메일이 허용 목록에 있는지 확인한다.
          학생은 이 목록을 바꿀 수 없으므로 자가 승격 경로가 아니다.
        */}
        <div className="border-t border-gray-100 pt-6 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-4">
            <p className="text-sm font-semibold text-blue-900 mb-1">👩‍🏫 교사/관리자이신가요?</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              교사로 등록된 계정이라면 아래 버튼으로 권한을 활성화할 수 있습니다.
            </p>
          </div>

          {bootstrapError && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {bootstrapError}
            </p>
          )}

          <Button
            onClick={handleTeacherBootstrap}
            disabled={bootstrapping}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 h-auto"
          >
            {bootstrapping ? '확인 중...' : '교사 권한 활성화'}
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
