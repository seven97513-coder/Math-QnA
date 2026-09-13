'use client';

import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { auth, db } from '@/lib/firebase/client';

type UserRow = {
  uid: string;
  email?: string;
  name?: string;
  displayName?: string;
  role?: 'pending' | 'student' | 'teacher';
  grade?: number;
  classNo?: number;
  studentNo?: number;
  isBlocked?: boolean;
};

/** 서버 라우트를 거치는 이유: 커스텀 클레임 갱신과 감사 로그는 Admin SDK만 할 수 있다 */
async function callAdmin(body: Record<string, unknown>): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? '처리에 실패했습니다.');
  }
}

function displayNameOf(u: UserRow) {
  return u.name ?? u.displayName ?? u.email ?? u.uid;
}

export default function TeacherUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserRow));
        setLoading(false);
      },
      (err) => {
        setError(`목록을 불러오지 못했습니다: ${err.message}`);
        setLoading(false);
      },
    );
  }, []);

  const pending = useMemo(() => users.filter((u) => (u.role ?? 'pending') === 'pending'), [users]);
  const approved = useMemo(() => users.filter((u) => u.role === 'student' || u.role === 'teacher'), [users]);

  const run = async (uid: string, body: Record<string, unknown>) => {
    setBusyUid(uid);
    setError('');
    try {
      await callAdmin({ targetUid: uid, ...body });
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24 text-base">
      <header className="mb-6 border-b pb-4">
        <Link href="/board/algebra" className="text-sm text-blue-600 hover:underline">
          &larr; 게시판으로
        </Link>
        <h1 className="mt-2 text-2xl font-bold">사용자 승인·관리</h1>
        <p className="mt-1 text-sm text-gray-600">
          승인하면 학생이 다시 로그인할 때부터 게시판을 쓸 수 있습니다.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-500">불러오는 중...</p>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-bold">
              승인 대기 <span className="text-amber-600">{pending.length}명</span>
            </h2>

            {pending.length === 0 ? (
              <p className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
                승인을 기다리는 사용자가 없습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {pending.map((u) => (
                  <PendingCard
                    key={u.uid}
                    user={u}
                    busy={busyUid === u.uid}
                    onApprove={(classNo, studentNo) =>
                      run(u.uid, { action: 'approve', classNo, studentNo })
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">승인된 사용자 {approved.length}명</h2>
            <ul className="space-y-2">
              {approved.map((u) => (
                <li
                  key={u.uid}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {displayNameOf(u)}
                      {/* NFR-6: 색상만으로 구분하지 않고 텍스트를 함께 쓴다 */}
                      <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {u.role === 'teacher' ? '교사' : '학생'}
                      </span>
                      {u.isBlocked && (
                        <span className="ml-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          차단됨
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-gray-500">
                      {u.role === 'student' && u.classNo
                        ? `${u.grade ?? 3}학년 ${u.classNo}반 ${u.studentNo}번 · `
                        : ''}
                      {u.email}
                    </p>
                  </div>

                  <Button
                    variant={u.isBlocked ? 'outline' : 'destructive'}
                    disabled={busyUid === u.uid}
                    onClick={() => run(u.uid, { action: u.isBlocked ? 'unblock' : 'block' })}
                    className="h-11 min-w-[88px] px-4"
                  >
                    {u.isBlocked ? '차단 해제' : '차단'}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function PendingCard({
  user,
  busy,
  onApprove,
}: {
  user: UserRow;
  busy: boolean;
  onApprove: (classNo: number, studentNo: number) => void;
}) {
  const [classNo, setClassNo] = useState<number | ''>('');
  const [studentNo, setStudentNo] = useState<number | ''>('');

  return (
    <li className="rounded border border-amber-200 bg-amber-50/50 p-4">
      <p className="font-medium">{displayNameOf(user)}</p>
      <p className="mb-3 truncate text-sm text-gray-600">{user.email}</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[100px] text-sm">
          <span className="mb-1 block text-gray-700">반</span>
          {/* M-4: iOS 자동 확대 방지를 위해 16px 이상 */}
          <select
            value={classNo}
            onChange={(e) => setClassNo(Number(e.target.value))}
            className="h-11 w-full rounded border bg-white px-2 text-base"
          >
            <option value="">선택</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}반
              </option>
            ))}
          </select>
        </label>

        <label className="flex-1 min-w-[100px] text-sm">
          <span className="mb-1 block text-gray-700">번호</span>
          <select
            value={studentNo}
            onChange={(e) => setStudentNo(Number(e.target.value))}
            className="h-11 w-full rounded border bg-white px-2 text-base"
          >
            <option value="">선택</option>
            {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}번
              </option>
            ))}
          </select>
        </label>

        <Button
          disabled={busy || classNo === '' || studentNo === ''}
          onClick={() => onApprove(Number(classNo), Number(studentNo))}
          className="h-11 min-w-[88px] px-4"
        >
          {busy ? '처리 중...' : '승인'}
        </Button>
      </div>
    </li>
  );
}
