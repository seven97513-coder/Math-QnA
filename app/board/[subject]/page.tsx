import { SUBJECTS, SubjectSlug } from '@/lib/constants/subjects';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default async function BoardPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  
  const currentSubject = SUBJECTS.find(s => s.slug === subject);
  
  if (!currentSubject) {
    notFound();
  }

  // NOTE: Server components shouldn't directly use Firebase client SDK for data fetching if it requires auth state,
  // but since we are doing it client-side according to PRD (FR-203), we will render a client component here.
  return (
    <div className="max-w-3xl mx-auto p-4 pb-20">
      <header className="flex items-center justify-between py-4 border-b">
        <h1 className="text-xl font-bold">질문 카페</h1>
      </header>
      
      <nav className="flex space-x-2 my-4 overflow-x-auto pb-2">
        {SUBJECTS.map(s => (
          <Link key={s.slug} href={`/board/${s.slug}`}>
            <Button 
              variant={s.slug === subject ? "default" : "outline"}
              className="whitespace-nowrap"
            >
              {s.label}
            </Button>
          </Link>
        ))}
      </nav>

      {/* Client component for the actual list */}
      <BoardList subject={currentSubject.slug as SubjectSlug} />

      <div className="fixed bottom-6 right-6">
        <Link href={`/board/${subject}/new`}>
          <Button className="rounded-full shadow-lg h-14 px-6 text-lg">
            질문하기
          </Button>
        </Link>
      </div>
    </div>
  );
}

function BoardList({ subject }: { subject: SubjectSlug }) {
  // This will be implemented as a client component to fetch real-time from Firestore
  return (
    <div className="text-center py-10 text-gray-500">
      <p>질문 목록을 불러오는 중...</p>
    </div>
  );
}
