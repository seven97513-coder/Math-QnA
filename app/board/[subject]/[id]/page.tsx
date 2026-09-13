import { notFound } from 'next/navigation';
import { SUBJECTS } from '@/lib/constants/subjects';
import Link from 'next/link';

export default async function QuestionDetailPage({ 
  params 
}: { 
  params: Promise<{ subject: string; id: string }> 
}) {
  const { subject, id } = await params;
  const currentSubject = SUBJECTS.find(s => s.slug === subject);

  if (!currentSubject) notFound();

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <div className="mb-4 text-sm text-gray-500">
        <Link href={`/board/${subject}`} className="hover:underline text-blue-600">
          &larr; 목록으로
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        {/* Placeholder for question details. In a real app, fetch from Firestore in client or server component using admin SDK */}
        <h1 className="text-xl font-bold mb-2">질문 상세 ({id})</h1>
        <p className="text-gray-600 mb-4">질문 내용이 여기에 표시됩니다.</p>
        
        {/* Placeholder for image */}
        <div className="bg-gray-100 h-64 rounded flex items-center justify-center text-gray-400 mb-4">
          첨부된 문제 사진
        </div>
      </div>

      <div className="space-y-4">
        {/* AI Hints Section */}
        <div className="border rounded-lg p-4">
          <h2 className="font-bold text-lg mb-2">AI 조교 힌트</h2>
          <p className="text-sm text-gray-600 mb-4">
            정답을 알려드리지 않습니다. 생각할 시간을 가져보세요!
          </p>
          <button className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded">
            힌트 요청하기
          </button>
        </div>

        {/* Teacher Answer Section */}
        <div className="border border-green-200 rounded-lg p-4 bg-green-50">
          <h2 className="font-bold text-lg mb-2 text-green-800">선생님 답변</h2>
          <p className="text-sm text-gray-700">선생님의 답변을 기다리는 중입니다.</p>
        </div>
      </div>
    </div>
  );
}
