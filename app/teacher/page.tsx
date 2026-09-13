'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db, auth } from '@/lib/firebase/client';
import { collection, query, orderBy, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { SUBJECTS, SubjectSlug } from '@/lib/constants/subjects';
import { Button } from '@/components/ui/button';

type Question = {
  id: string;
  subject: string;
  title: string;
  body: string;
  authorName: string;
  authorGrade: number;
  authorClass: number;
  authorNo: number;
  status: 'ai_answered' | 'waiting_teacher' | 'teacher_answered' | 'resolved';
  createdAt?: Timestamp;
  answeredAt?: Timestamp | null;
};

export default function TeacherDashboardPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('waiting_teacher');

  useEffect(() => {
    // Realtime listen to questions
    const q = query(
      collection(db, 'questions'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Question[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Question);
        });
        setQuestions(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching questions for teacher:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const waitingCount = questions.filter((q) => q.status === 'waiting_teacher').length;
  const answeredCount = questions.filter((q) => q.status === 'teacher_answered').length;
  const aiCount = questions.filter((q) => q.status === 'ai_answered').length;

  const filteredQuestions = questions.filter((q) => {
    const matchSubject = filterSubject === 'all' || q.subject === filterSubject;
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'waiting_teacher' && q.status === 'waiting_teacher') ||
      (filterStatus === 'teacher_answered' && q.status === 'teacher_answered') ||
      (filterStatus === 'ai_answered' && q.status === 'ai_answered');
    return matchSubject && matchStatus;
  });

  const getStatusBadge = (status: Question['status']) => {
    switch (status) {
      case 'waiting_teacher':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 animate-pulse">
            ⏳ 선생님 답변 대기
          </span>
        );
      case 'teacher_answered':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
            ✓ 답변 완료
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
            해결됨
          </span>
        );
      case 'ai_answered':
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
            🤖 AI 힌트 단계
          </span>
        );
    }
  };

  const getSubjectLabel = (slug: string) => {
    const s = SUBJECTS.find((sub) => sub.slug === slug);
    return s ? s.label : slug;
  };

  const formatDate = (ts?: Timestamp) => {
    if (!ts) return '';
    const date = ts.toDate();
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 pb-24">
      {/* Header & Nav */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-gray-200 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">교사 질문 대기열 & 대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">학생들의 질문을 확인하고 직접 답변을 작성합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/teacher/users">
            <Button variant="outline" className="text-sm">
              👥 학생 승인·관리
            </Button>
          </Link>
          <Link href="/board/algebra">
            <Button variant="outline" className="text-sm">
              📋 학생 게시판 보기
            </Button>
          </Link>
        </div>
      </header>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setFilterStatus('waiting_teacher')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'waiting_teacher'
              ? 'border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-200'
              : 'bg-white border-gray-200 hover:border-amber-300'
          }`}
        >
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">선생님 답변 대기</p>
          <p className="text-3xl font-extrabold text-amber-900 mt-1">{waitingCount}건</p>
          <p className="text-xs text-amber-600 mt-1">우선 답변이 필요한 질문</p>
        </button>

        <button
          onClick={() => setFilterStatus('ai_answered')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'ai_answered'
              ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-200'
              : 'bg-white border-gray-200 hover:border-blue-300'
          }`}
        >
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">AI 힌트 열람 중</p>
          <p className="text-3xl font-extrabold text-blue-900 mt-1">{aiCount}건</p>
          <p className="text-xs text-blue-600 mt-1">학생이 힌트 고민 중</p>
        </button>

        <button
          onClick={() => setFilterStatus('teacher_answered')}
          className={`p-4 rounded-xl border text-left transition-all ${
            filterStatus === 'teacher_answered'
              ? 'border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-200'
              : 'bg-white border-gray-200 hover:border-emerald-300'
          }`}
        >
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">선생님 답변 완료</p>
          <p className="text-3xl font-extrabold text-emerald-900 mt-1">{answeredCount}건</p>
          <p className="text-xs text-emerald-600 mt-1">답변이 등록된 질문</p>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50 p-3 rounded-lg mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 mr-1">과목:</span>
          <button
            onClick={() => setFilterSubject('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filterSubject === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체
          </button>
          {SUBJECTS.map((s) => (
            <button
              key={s.slug}
              onClick={() => setFilterSubject(s.slug)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterSubject === s.slug ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">상태:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">전체 상태</option>
            <option value="waiting_teacher">답변 대기 중만</option>
            <option value="ai_answered">AI 힌트 단계</option>
            <option value="teacher_answered">답변 완료</option>
          </select>
        </div>
      </div>

      {/* Question List */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">질문 목록을 불러오는 중...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 text-lg mb-1">해당하는 질문이 없습니다.</p>
          <p className="text-xs text-gray-400">필터 설정을 변경하거나 학생의 새 질문을 기다려 주세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((q) => (
            <div
              key={q.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-800">
                    {getSubjectLabel(q.subject)}
                  </span>
                  {getStatusBadge(q.status)}
                  <span className="text-xs text-gray-400">{formatDate(q.createdAt)}</span>
                </div>

                <Link href={`/board/${q.subject}/${q.id}`}>
                  <h3 className="text-base font-bold text-gray-900 hover:text-blue-600 transition-colors truncate">
                    {q.title}
                  </h3>
                </Link>

                <p className="text-xs text-gray-500 mt-1">
                  작성자: <span className="font-medium text-gray-700">{q.authorGrade}학년 {q.authorClass}반 {q.authorNo}번 {q.authorName}</span>
                </p>
              </div>

              <div className="flex-shrink-0">
                <Link href={`/board/${q.subject}/${q.id}`}>
                  <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 px-4">
                    {q.status === 'teacher_answered' ? '답변 수정/확인' : '답변 작성하기 →'}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
