'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, storage, auth } from '@/lib/firebase/client';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { SUBJECTS } from '@/lib/constants/subjects';
import { Button } from '@/components/ui/button';

type QuestionData = {
  id: string;
  subject: string;
  title: string;
  body: string;
  authorId: string;
  authorGrade: number;
  authorClass: number;
  authorNo: number;
  authorName: string;
  imagePaths?: string[];
  status: 'ai_answered' | 'waiting_teacher' | 'teacher_answered' | 'resolved';
  visibility: 'public' | 'private';
  hintLevelUsed?: number;
  createdAt?: Timestamp;
  answeredAt?: Timestamp | null;
};

type AnswerData = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'teacher' | 'student';
  body: string;
  createdAt?: Timestamp;
};

type HintData = {
  id: string;
  level: number;
  content: string;
  createdAt?: Timestamp;
};

export default function QuestionDetailPage({
  params,
}: {
  params: Promise<{ subject: string; id: string }>;
}) {
  const resolvedParams = use(params);
  const { subject, id } = resolvedParams;
  const router = useRouter();

  const currentSubject = SUBJECTS.find((s) => s.slug === subject);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [hints, setHints] = useState<HintData[]>([]);
  const [loading, setLoading] = useState(true);

  // Teacher answer form state
  const [teacherAnswerText, setTeacherAnswerText] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  // Auth & role checking
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUser(user);

      try {
        const token = await user.getIdTokenResult();
        let role = token.claims.role as string | undefined;
        if (!role) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          role = userDoc.data()?.role;
        }
        setUserRole(role || null);
      } catch (err) {
        console.warn('Error checking role:', err);
      }
    });

    return () => unsubAuth();
  }, [router]);

  // Realtime listener for Question document
  useEffect(() => {
    const unsubQ = onSnapshot(
      doc(db, 'questions', id),
      async (snap) => {
        if (!snap.exists()) {
          setQuestion(null);
          setLoading(false);
          return;
        }

        const data = { id: snap.id, ...snap.data() } as QuestionData;
        setQuestion(data);
        setLoading(false);

        // Fetch image download URLs
        if (data.imagePaths && data.imagePaths.length > 0) {
          try {
            const urls = await Promise.all(
              data.imagePaths.map(async (path) => {
                const imgRef = ref(storage, path);
                return await getDownloadURL(imgRef);
              })
            );
            setImageUrls(urls);
          } catch (err) {
            console.error('Failed to load image URLs:', err);
          }
        }
      },
      (error) => {
        console.error('Error fetching question:', error);
        setLoading(false);
      }
    );

    // Listen to Answers subcollection
    const unsubAnswers = onSnapshot(
      query(collection(db, 'questions', id, 'answers'), orderBy('createdAt', 'asc')),
      (snapshot) => {
        const list: AnswerData[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as AnswerData);
        });
        setAnswers(list);
      },
      (err) => console.error('Error fetching answers:', err)
    );

    // Listen to Hints subcollection
    const unsubHints = onSnapshot(
      query(collection(db, 'questions', id, 'hints'), orderBy('level', 'asc')),
      (snapshot) => {
        const list: HintData[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as HintData);
        });
        setHints(list);
      },
      (err) => console.error('Error fetching hints:', err)
    );

    return () => {
      unsubQ();
      unsubAnswers();
      unsubHints();
    };
  }, [id]);

  const isTeacher = userRole === 'teacher';
  const isAuthor = currentUser?.uid === question?.authorId;

  // Teacher submits answer
  const handleSubmitTeacherAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherAnswerText.trim() || !currentUser || !isTeacher) return;

    setSubmittingAnswer(true);
    try {
      // 1. Add to answers subcollection
      await addDoc(collection(db, 'questions', id, 'answers'), {
        authorId: currentUser.uid,
        authorName: currentUser.displayName || '수학 담당 교사',
        authorRole: 'teacher',
        body: teacherAnswerText.trim(),
        createdAt: serverTimestamp(),
      });

      // 2. Update question status
      await updateDoc(doc(db, 'questions', id), {
        status: 'teacher_answered',
        resolvedBy: 'teacher',
        answeredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setTeacherAnswerText('');
      alert('선생님 답변이 성공적으로 등록되었습니다!');
    } catch (err: any) {
      console.error('Failed to submit teacher answer:', err);
      alert(`답변 등록 실패: ${err.message || '오류가 발생했습니다.'}`);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // Student escalates to teacher
  const handleEscalateToTeacher = async () => {
    if (!currentUser || !isAuthor) return;
    try {
      await updateDoc(doc(db, 'questions', id), {
        status: 'waiting_teacher',
        updatedAt: serverTimestamp(),
      });
      alert('선생님께 질문이 전달되었습니다. 교사 대기열에 등록되었습니다.');
    } catch (err: any) {
      console.error('Failed to request teacher answer:', err);
      alert(`요청 실패: ${err.message || '오류가 발생했습니다.'}`);
    }
  };

  // Student or Teacher requests AI Hint
  const [requestingHint, setRequestingHint] = useState(false);

  const handleRequestHint = async () => {
    if (!currentUser) return;
    setRequestingHint(true);
    try {
      const token = await currentUser.getIdToken();
      const nextLevel = hints.length + 1;
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionId: id,
          level: nextLevel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`AI 힌트 안내: ${data.message || '힌트를 생성하지 못했습니다.'}`);
      }
    } catch (err: any) {
      console.error('Hint request error:', err);
      alert(`오류: ${err.message || '네트워크 오류가 발생했습니다.'}`);
    } finally {
      setRequestingHint(false);
    }
  };

  // Mark resolved
  const handleMarkResolved = async () => {
    try {
      await updateDoc(doc(db, 'questions', id), {
        status: 'resolved',
        isResolved: true,
        updatedAt: serverTimestamp(),
      });
      alert('질문이 해결 완료 처리되었습니다.');
    } catch (err: any) {
      console.error('Failed to resolve question:', err);
    }
  };

  const getStatusBadge = (status: QuestionData['status']) => {
    switch (status) {
      case 'waiting_teacher':
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
            ⏳ 선생님 답변 대기 중
          </span>
        );
      case 'teacher_answered':
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
            ✓ 선생님 답변 완료
          </span>
        );
      case 'resolved':
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
            해결 완료
          </span>
        );
      case 'ai_answered':
      default:
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
            🤖 AI 힌트 단계
          </span>
        );
    }
  };

  const formatDate = (ts?: Timestamp) => {
    if (!ts) return '';
    const d = ts.toDate();
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 py-20 text-center text-gray-500">
        질문 정보를 불러오는 중...
      </div>
    );
  }

  if (!question) {
    return (
      <div className="max-w-3xl mx-auto p-4 py-20 text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">질문을 찾을 수 없습니다</h2>
        <p className="text-gray-500 mb-6">삭제되었거나 권한이 없는 질문입니다.</p>
        <Link href={`/board/${subject}`}>
          <Button variant="outline">게시판으로 돌아가기</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 pb-32">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between mb-4">
        <Link href={`/board/${subject}`} className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1">
          &larr; {currentSubject?.label || subject} 게시판
        </Link>
        {isTeacher && (
          <Link href="/teacher">
            <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-1 rounded-md font-semibold hover:bg-purple-200 cursor-pointer">
              👩‍🏫 교사 대기열 가기
            </span>
          </Link>
        )}
      </div>

      {/* Main Question Card */}
      <article className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-800">
            {currentSubject?.label}
          </span>
          {getStatusBadge(question.status)}
          {question.visibility === 'private' && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-600">
              🔒 비공개
            </span>
          )}
        </div>

        <h1 className="text-2xl font-extrabold text-gray-900 mb-3 leading-snug">
          {question.title}
        </h1>

        <div className="flex items-center justify-between text-xs text-gray-500 border-b border-gray-100 pb-4 mb-4">
          <div>
            작성자: <span className="font-semibold text-gray-800">{question.authorGrade}학년 {question.authorClass}반 {question.authorNo}번 {question.authorName}</span>
          </div>
          <div>{formatDate(question.createdAt)}</div>
        </div>

        {/* Question Body */}
        <div className="text-gray-800 text-base leading-relaxed whitespace-pre-wrap mb-6">
          {question.body}
        </div>

        {/* Attached Images */}
        {imageUrls.length > 0 && (
          <div className="space-y-4 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">첨부된 문제 사진</p>
            <div className="grid grid-cols-1 gap-4">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 max-h-[500px] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`문제 사진 ${idx + 1}`}
                    className="max-h-[500px] w-auto object-contain mx-auto"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action button for student escalation */}
        {isAuthor && question.status !== 'resolved' && (
          <div className="flex items-center gap-2 pt-4 border-t border-gray-100 flex-wrap">
            {question.status !== 'waiting_teacher' && question.status !== 'teacher_answered' && (
              <Button
                onClick={handleEscalateToTeacher}
                variant="outline"
                className="text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                🙋‍♂️ AI 힌트 대신 선생님께 직접 질문하기
              </Button>
            )}
            <Button
              onClick={handleMarkResolved}
              variant="outline"
              className="text-xs text-gray-600 hover:bg-gray-100"
            >
              ✓ 해결 완료 표시
            </Button>
          </div>
        )}
      </article>

      {/* AI Hints Section */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h2 className="text-base font-bold text-blue-900">AI 조교 소크라테스 힌트</h2>
          </div>
          <span className="text-xs text-blue-600 bg-white/80 px-2 py-0.5 rounded font-medium">
            정답 비공개 원칙
          </span>
        </div>
        <p className="text-xs text-blue-700 mb-4">
          AI 조교는 정답을 바로 알려주지 않고 스스로 생각할 수 있는 유도 질문을 단계별로 제공합니다.
        </p>

        {hints.length === 0 ? (
          <div className="bg-white/90 border border-blue-100 rounded-lg p-5 text-center">
            <p className="text-sm text-gray-700 mb-3">
              아직 확인된 AI 힌트가 없습니다. 생각할 시간을 가져본 후 1단계 힌트를 요청해 보세요!
            </p>
            <Button
              onClick={handleRequestHint}
              disabled={requestingHint}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-5"
            >
              {requestingHint ? 'AI 힌트 생성 중...' : '💡 1단계 AI 힌트 요청하기'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {hints.map((h) => (
              <div key={h.id} className="bg-white rounded-lg p-4 border border-blue-100 shadow-2xs">
                <span className="inline-block text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded mb-2">
                  {h.level}단계 힌트
                </span>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {h.content}
                </p>
              </div>
            ))}

            {hints.length < 3 ? (
              <div className="pt-3 border-t border-blue-200/60 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-blue-800 font-medium">
                  현재 {hints.length}/3단계 힌트 확인 완료
                </span>
                <Button
                  onClick={handleRequestHint}
                  disabled={requestingHint}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4"
                >
                  {requestingHint ? 'AI 힌트 생성 중...' : `💡 다음 ${hints.length + 1}단계 힌트 요청하기`}
                </Button>
              </div>
            ) : (
              <div className="pt-3 border-t border-blue-200/60 text-center text-xs text-blue-800 font-medium">
                모든 3단계 힌트를 확인하셨습니다. 더 궁금한 점은 아래에서 선생님께 직접 질문해 보세요!
              </div>
            )}
          </div>
        )}
      </section>

      {/* Teacher Answers Section */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎓</span>
            <h2 className="text-lg font-bold text-gray-900">선생님 공식 답변</h2>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            {answers.length}개의 답변
          </span>
        </div>

        {/* Existing Answers List */}
        {answers.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500 mb-6">
            <p className="text-sm">아직 등록된 선생님 답변이 없습니다.</p>
            {question.status === 'waiting_teacher' && (
              <p className="text-xs text-amber-600 mt-1">
                ⏳ 학생이 선생님의 답변을 기다리고 있습니다.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {answers.map((ans) => (
              <div
                key={ans.id}
                className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-600 text-white">
                      교사 답변
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {ans.authorName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(ans.createdAt)}
                  </span>
                </div>
                <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap mt-2">
                  {ans.body}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Teacher Answer Form (Only Visible to Teachers) */}
        {isTeacher ? (
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <span>✍️</span> 교사 답변 작성하기
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              선생님 계정으로 공식 해설과 피드백을 등록합니다. 등록 시 학생에게 답변 완료 상태로 즉시 반영됩니다.
            </p>

            <form onSubmit={handleSubmitTeacherAnswer} className="space-y-3">
              <textarea
                value={teacherAnswerText}
                onChange={(e) => setTeacherAnswerText(e.target.value)}
                placeholder="학생의 질문에 대한 친절하고 정확한 해설 피드백을 작성해 주세요..."
                rows={5}
                required
                className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent leading-relaxed"
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submittingAnswer || !teacherAnswerText.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-6 h-10"
                >
                  {submittingAnswer ? '답변 등록 중...' : '선생님 답변 등록하기'}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center mt-4">
            답변 작성은 담당 선생님만 가능합니다.
          </p>
        )}
      </section>
    </div>
  );
}
