'use client';

import { useState } from 'react';
import { SUBJECTS, SubjectSlug } from '@/lib/constants/subjects';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image/compress';
import { db, storage, auth } from '@/lib/firebase/client';
import { ref, uploadBytes } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { notFound, useRouter } from 'next/navigation';
import { use } from 'react';

export default function NewQuestionPage({ params }: { params: Promise<{ subject: string }> }) {
  const resolvedParams = use(params);
  const subject = resolvedParams.subject;
  const currentSubject = SUBJECTS.find((s) => s.slug === subject);
  
  if (!currentSubject) notFound();

  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FR-201: Mocking user info for now. Should be fetched from users/{uid}
  const authorGrade = 3;
  const [authorClass, setAuthorClass] = useState<number | ''>('');
  const [authorNo, setAuthorNo] = useState<number | ''>('');
  const [authorName, setAuthorName] = useState('');

  const isValid = 
    file && 
    authorClass !== '' && 
    authorNo !== '' && 
    authorName.trim().length >= 2 && 
    title.trim().length >= 2 && 
    body.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !auth.currentUser) return;
    
    setIsSubmitting(true);
    try {
      const qRef = doc(db, 'questions');
      const qId = qRef.id;
      const uid = auth.currentUser.uid;
      
      const compressed = await compressImage(file!);
      const fileExt = file!.name.split('.').pop();
      const storageRef = ref(storage, `questions/${uid}/${qId}/img1.${fileExt}`);
      
      await uploadBytes(storageRef, compressed);

      await setDoc(qRef, {
        id: qId,
        authorId: uid,
        authorGrade,
        authorClass: Number(authorClass),
        authorNo: Number(authorNo),
        authorName,
        subject: currentSubject.slug,
        title,
        body,
        imagePaths: [storageRef.fullPath],
        visibility,
        status: 'ai_answered',
        hintLevelUsed: 0,
        isResolved: false,
        resolvedBy: null,
        tags: null,
        viewCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        answeredAt: null
      });

      // trigger AI hint async
      fetch('/api/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: qId })
      }).catch(console.error);

      router.push(`/board/${currentSubject.slug}/${qId}`);
    } catch (error) {
      console.error('Failed to submit question:', error);
      alert('질문 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <div className="mb-4 inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-bold">
        {currentSubject.label}
      </div>
      <h1 className="text-2xl font-bold mb-6">새 질문 작성</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">학년</label>
            <input type="text" value="3학년" disabled className="w-full border p-2 rounded bg-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">반</label>
            <select 
              value={authorClass} 
              onChange={e => setAuthorClass(Number(e.target.value))}
              className="w-full border p-2 rounded"
            >
              <option value="">선택</option>
              {[...Array(12)].map((_, i) => (
                <option key={i+1} value={i+1}>{i+1}반</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">번호</label>
            <select 
              value={authorNo} 
              onChange={e => setAuthorNo(Number(e.target.value))}
              className="w-full border p-2 rounded"
            >
              <option value="">선택</option>
              {[...Array(40)].map((_, i) => (
                <option key={i+1} value={i+1}>{i+1}번</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">이름</label>
          <input 
            type="text" 
            value={authorName} 
            onChange={e => setAuthorName(e.target.value)} 
            className="w-full border p-2 rounded"
            placeholder="실명을 입력하세요"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">제목</label>
          <input 
            type="text" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            className="w-full border p-2 rounded"
            placeholder="어떤 문제인지 요약해주세요"
            maxLength={60}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">사진 첨부 (최소 1장)</label>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">어디서 막혔나요?</label>
          <textarea 
            value={body} 
            onChange={e => setBody(e.target.value)} 
            className="w-full border p-2 rounded h-32"
            placeholder="① 어디까지 풀었는지 ② 어디서 막혔는지 ③ 무엇을 물어보고 싶은지"
            maxLength={1500}
          />
        </div>

        <div>
          <span className="block text-sm font-medium mb-2">공개 여부</span>
          <div className="space-x-4">
            <label>
              <input 
                type="radio" 
                checked={visibility === 'public'} 
                onChange={() => setVisibility('public')}
                className="mr-2"
              />
              공개
            </label>
            <label>
              <input 
                type="radio" 
                checked={visibility === 'private'} 
                onChange={() => setVisibility('private')}
                className="mr-2"
              />
              비공개 (선생님과 나만)
            </label>
          </div>
        </div>

        <Button 
          type="submit" 
          disabled={!isValid || isSubmitting} 
          className="w-full h-14 text-lg"
        >
          {isSubmitting ? '업로드 중...' : '질문 등록'}
        </Button>
      </form>
    </div>
  );
}
