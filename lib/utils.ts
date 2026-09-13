export { cn } from "cn"

/**
 * catch로 잡은 값에서 사람이 읽을 문구를 뽑는다.
 * catch 변수는 any가 아니라 unknown이므로 좁혀 쓴다.
 */
export function errorMessage(error: unknown, fallback = '오류가 발생했습니다.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return fallback;
}
