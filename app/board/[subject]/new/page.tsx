'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { SUBJECTS, SubjectSlug } from '@/lib/constants/subjects';
import { Button } from '@/components/ui/button';
import { compressImage } from '@/lib/image/compress';
import { db, storage, auth } from '@/lib/firebase/client';
import { errorMessage } from '@/lib/utils';
import { ref, uploadBytes } from 'firebase/storage';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { notFound, useRouter } from 'next/navigation';
import { Camera, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import ImageEditorModal from '@/components/ImageEditorModal';

export default function NewQuestionPage({ params }: { params: Promise<{ subject: string }> }) {
  const resolvedParams = use(params);
  const subject = resolvedParams.subject;
  const currentSubject = SUBJECTS.find((s) => s.slug === subject);
  
  if (!currentSubject) notFound();

  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  // 미리보기 URL은 file에서 파생되는 값이다. effect에서 setState하면 렌더가 한 번 더 돈다.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 만들어 둔 object URL은 파일이 바뀌거나 화면을 떠날 때 해제한다.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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
      const qRef = doc(collection(db, 'questions'));
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
      try {
        const token = await auth.currentUser.getIdToken();
        fetch('/api/hint', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ questionId: qId, level: 1 })
        }).catch(console.error);
      } catch (tokenErr) {
        console.warn('Failed to get token for initial hint:', tokenErr);
      }

      router.push(`/board/${currentSubject.slug}/${qId}`);
    } catch (error) {
      console.error('Failed to submit question:', error);
      alert(`질문 등록에 실패했습니다: ${errorMessage(error)}`);
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
          <label className="block text-sm font-medium mb-1">
            사진 첨부 <span className="text-red-500">*</span> (촬영 또는 앨범 파일)
          </label>

          {!file ? (
            <div className="grid grid-cols-2 gap-3 mt-1">
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-neutral-300 hover:border-blue-500 bg-neutral-50 hover:bg-blue-50/40 rounded-xl cursor-pointer transition">
                <Camera className="w-7 h-7 text-blue-600 mb-1" />
                <span className="text-sm font-semibold text-neutral-800">직접 촬영하기</span>
                <span className="text-xs text-neutral-500">카메라 실행</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) {
                      setFile(selected);
                      setEditingFile(selected); // Automatically open editor for quick adjustment
                    }
                  }}
                />
              </label>

              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-neutral-300 hover:border-blue-500 bg-neutral-50 hover:bg-blue-50/40 rounded-xl cursor-pointer transition">
                <ImageIcon className="w-7 h-7 text-green-600 mb-1" />
                <span className="text-sm font-semibold text-neutral-800">앨범 / 파일 선택</span>
                <span className="text-xs text-neutral-500">갤러리 사진 불러오기</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) {
                      setFile(selected);
                      setEditingFile(selected); // Automatically open editor for quick adjustment
                    }
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="relative mt-2 p-3 border rounded-xl bg-neutral-50 flex items-center gap-3">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="첨부된 문제 사진"
                  className="w-20 h-20 object-cover rounded-lg border shadow-sm"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-neutral-800">{file.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingFile(file)}
                    className="h-8 text-xs flex items-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Pencil className="w-3.5 h-3.5" /> 사진 편집 (회전/자르기/표시)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setFile(null)}
                    className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
                  </Button>
                </div>
              </div>
            </div>
          )}
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
          className="w-full h-14 text-lg font-bold"
        >
          {isSubmitting ? '업로드 중...' : '질문 등록'}
        </Button>
      </form>

      {/* Image Editor Modal */}
      {editingFile && (
        <ImageEditorModal
          file={editingFile}
          onSave={(edited) => {
            setFile(edited);
            setEditingFile(null);
          }}
          onCancel={() => setEditingFile(null)}
        />
      )}
    </div>
  );
}
