import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PendingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-4">가입 승인 대기 중</h1>
        <p className="text-gray-600 mb-6">
          선생님의 승인이 필요합니다. 승인 후 다시 로그인해 주세요.
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full">
            로그인 화면으로 돌아가기
          </Button>
        </Link>
      </div>
    </div>
  );
}
