import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { ref, getBytes, uploadString } from 'firebase/storage';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-math-qna',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
    },
    storage: {
      rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();

  // Setup basic data for tests
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // B's private question
    await setDoc(doc(db, 'questions', 'q_private_b'), {
      authorId: 'studentB',
      visibility: 'private',
      subject: 'algebra',
    });
    // B's public question
    await setDoc(doc(db, 'questions', 'q_public_b'), {
      authorId: 'studentB',
      visibility: 'public',
      subject: 'algebra',
    });
    
    // Stats doc
    await setDoc(doc(db, 'stats', 'weekly_2026_37'), {
      totalQuestions: 10,
    });

    // 커스텀 클레임이 없는 사용자들. 역할은 users 문서로만 판별된다.
    await setDoc(doc(db, 'users', 'docStudent'), { uid: 'docStudent', role: 'student' });
    await setDoc(doc(db, 'users', 'docPending'), { uid: 'docPending', role: 'pending' });
    await setDoc(doc(db, 'users', 'docBlocked'), {
      uid: 'docBlocked',
      role: 'student',
      isBlocked: true,
    });

    // NFR-10 감사 로그 (서버 라우트만 기록한다)
    await setDoc(doc(db, 'auditLogs', 'log1'), {
      actorUid: 'teacher1',
      action: 'approve',
      targetUid: 'docStudent',
    });

    // 사진 픽스처. storage.rules는 질문 문서의 visibility를 조회해 판단하므로
    // 파일이 실제로 존재해야 allow/deny를 구분해 검증할 수 있다.
    const storage = context.storage();
    const meta = { contentType: 'image/jpeg' };
    await uploadString(ref(storage, 'questions/studentB/q_private_b/test.jpg'), 'x', 'raw', meta);
    await uploadString(ref(storage, 'questions/studentB/q_public_b/test.jpg'), 'x', 'raw', meta);
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Security Rules', () => {
  it('학생 A가 학생 B의 비공개 질문을 읽으면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    const qDoc = doc(db, 'questions', 'q_private_b');
    await assertFails(getDoc(qDoc));
  });

  it('학생 A가 학생 B의 공개 질문을 읽으면 허용된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    const qDoc = doc(db, 'questions', 'q_public_b');
    await assertSucceeds(getDoc(qDoc));
  });

  it('학생 A가 visibility/authorId 조건 없이 목록을 조회하면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    const qQuery = query(collection(db, 'questions'), where('subject', '==', 'algebra'));
    await assertFails(getDocs(qQuery));
  });

  it('학생 A가 학생 B의 비공개 질문 사진 경로에 접근하면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const storage = alice.storage();
    const fileRef = ref(storage, 'questions/studentB/q_private_b/test.jpg');
    // Using getBytes to simulate reading the file
    await assertFails(getBytes(fileRef));
  });

  // 이 테스트는 storage.rules의 firestore.get()이 실제로 동작하는지 확인하는 카나리아다.
  // 에뮬레이터와 테스트의 projectId가 어긋나면 조회가 null이 되어 모든 사진이 차단되고,
  // "비공개 차단" 테스트는 규칙이 아니라 조회 실패 덕분에 통과하게 된다.
  it('학생 A가 학생 B의 공개 질문 사진은 읽을 수 있다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const storage = alice.storage();
    const fileRef = ref(storage, 'questions/studentB/q_public_b/test.jpg');
    await assertSucceeds(getBytes(fileRef));
  });

  it('사진 없이 질문을 생성하면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    await assertFails(setDoc(doc(db, 'questions', 'q_new_a'), {
      authorId: 'studentA',
      authorGrade: 3, authorClass: 1, authorNo: 1, authorName: 'Alice',
      title: 'Title', body: 'This is a long enough body',
      visibility: 'public',
      imagePaths: [] // empty
    }));
  });

  it('반 또는 번호 범위를 벗어난 값으로 생성하면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    // Class out of range
    await assertFails(setDoc(doc(db, 'questions', 'q_new_a1'), {
      authorId: 'studentA', authorGrade: 3, authorClass: 13, authorNo: 1, authorName: 'Alice',
      title: 'Title', body: 'This is a long enough body', visibility: 'public', imagePaths: ['img1.jpg']
    }));
    // No out of range
    await assertFails(setDoc(doc(db, 'questions', 'q_new_a2'), {
      authorId: 'studentA', authorGrade: 3, authorClass: 1, authorNo: 41, authorName: 'Alice',
      title: 'Title', body: 'This is a long enough body', visibility: 'public', imagePaths: ['img1.jpg']
    }));
  });

  it('학생 A가 자기 질문의 authorId를 B로 바꾸려 하면 거부된다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'questions', 'q_alice'), {
        authorId: 'studentA',
        visibility: 'public',
        subject: 'algebra',
      });
    });

    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    await assertFails(updateDoc(doc(db, 'questions', 'q_alice'), {
      authorId: 'studentB'
    }));
  });

  it('학생이 자기 AI 호출 카운터를 직접 쓰면 거부된다 (NFR-4)', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    // 읽기는 남은 횟수 표시를 위해 허용, 쓰기는 서버 라우트만
    await assertSucceeds(getDoc(doc(db, 'users', 'studentA', 'usage', '20260913')));
    await assertFails(setDoc(doc(db, 'users', 'studentA', 'usage', '20260913'), { hintCount: 0 }));
  });

  it('학생 A가 학생 B의 AI 호출 카운터를 읽으면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    await assertFails(getDoc(doc(db, 'users', 'studentB', 'usage', '20260913')));
  });

  // --- 역할 판별 (커스텀 클레임 없이 users 문서로만) ---

  const validQuestion = (uid: string) => ({
    authorId: uid,
    authorGrade: 3,
    authorClass: 12,
    authorNo: 1,
    authorName: '김준형',
    subject: 'algebra',
    title: '대수 문제 질문',
    body: '처음 시작을 잘 모르겠어요',
    imagePaths: [`questions/${uid}/q_new/img1.jpg`],
    visibility: 'private' as const,
  });

  it('승인 대기(pending) 사용자는 질문을 만들 수 없다', async () => {
    const pending = testEnv.authenticatedContext('docPending');
    const db = pending.firestore();
    await assertFails(setDoc(doc(db, 'questions', 'q_pending'), validQuestion('docPending')));
  });

  it('users 문서의 role이 student면 클레임 없이도 질문을 만들 수 있다', async () => {
    const student = testEnv.authenticatedContext('docStudent');
    const db = student.firestore();
    await assertSucceeds(setDoc(doc(db, 'questions', 'q_doc'), validQuestion('docStudent')));
  });

  it('학생이 자기 users 문서의 role을 teacher로 바꾸면 거부된다', async () => {
    const student = testEnv.authenticatedContext('docStudent');
    const db = student.firestore();
    // 이름 같은 프로필 수정은 허용
    await assertSucceeds(updateDoc(doc(db, 'users', 'docStudent'), { name: '새 이름' }));
    // 역할 승격은 거부
    await assertFails(updateDoc(doc(db, 'users', 'docStudent'), { role: 'teacher' }));
  });

  it('최초 사용자 문서를 teacher로 생성하면 거부된다', async () => {
    const newbie = testEnv.authenticatedContext('newUser');
    const db = newbie.firestore();
    await assertFails(setDoc(doc(db, 'users', 'newUser'), { uid: 'newUser', role: 'teacher' }));
    await assertSucceeds(setDoc(doc(db, 'users', 'newUser'), { uid: 'newUser', role: 'pending' }));
  });

  it('차단된 사용자는 질문을 만들 수 없다 (FR-103)', async () => {
    const blocked = testEnv.authenticatedContext('docBlocked');
    const db = blocked.firestore();
    await assertFails(setDoc(doc(db, 'questions', 'q_blocked'), validQuestion('docBlocked')));
  });

  it('차단은 커스텀 클레임이 student로 남아 있어도 즉시 적용된다 (FR-103)', async () => {
    // 토큰은 최대 1시간 갱신되지 않으므로, 차단 판정은 users 문서를 봐야 한다
    const blocked = testEnv.authenticatedContext('docBlocked', { role: 'student' });
    const db = blocked.firestore();
    await assertFails(setDoc(doc(db, 'questions', 'q_blocked2'), validQuestion('docBlocked')));
  });

  it('교사도 클라이언트에서 역할·차단을 바꿀 수 없다 (서버 라우트 전용)', async () => {
    const teacher = testEnv.authenticatedContext('teacher1', { role: 'teacher' });
    const db = teacher.firestore();
    // 프로필 수정은 가능
    await assertSucceeds(updateDoc(doc(db, 'users', 'docPending'), { name: '홍길동' }));
    // 승인(역할 변경)과 차단은 Admin SDK로만
    await assertFails(updateDoc(doc(db, 'users', 'docPending'), { role: 'student' }));
    await assertFails(updateDoc(doc(db, 'users', 'docStudent'), { isBlocked: true }));
  });

  it('감사 로그는 교사만 읽고 아무도 쓸 수 없다 (NFR-10)', async () => {
    const student = testEnv.authenticatedContext('docStudent');
    await assertFails(getDoc(doc(student.firestore(), 'auditLogs', 'log1')));

    const teacher = testEnv.authenticatedContext('teacher1', { role: 'teacher' });
    await assertSucceeds(getDoc(doc(teacher.firestore(), 'auditLogs', 'log1')));
    await assertFails(
      setDoc(doc(teacher.firestore(), 'auditLogs', 'log2'), { action: 'forged' }),
    );
  });

  // --- 사진 접근 (교사는 전부, 학생은 본인 것과 공개글만) ---

  it('클레임 없이 users 문서만 teacher인 교사도 학생의 비공개 사진을 볼 수 있다', async () => {
    // 승인 경로를 거치지 않아 커스텀 클레임이 아직 없는 교사 계정.
    // storage.rules가 클레임만 보면 이 교사는 학생 사진을 전혀 못 본다.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'docTeacher'), {
        uid: 'docTeacher',
        role: 'teacher',
      });
    });

    const teacher = testEnv.authenticatedContext('docTeacher');
    const fileRef = ref(teacher.storage(), 'questions/studentB/q_private_b/test.jpg');
    await assertSucceeds(getBytes(fileRef));
  });

  it('학생 A는 학생 B의 비공개 사진을 여전히 볼 수 없다', async () => {
    const alice = testEnv.authenticatedContext('docStudent');
    const fileRef = ref(alice.storage(), 'questions/studentB/q_private_b/test.jpg');
    await assertFails(getBytes(fileRef));
  });

  // --- 삭제 권한 ---

  it('학생은 자기 질문도 삭제할 수 없다', async () => {
    const student = testEnv.authenticatedContext('studentB', { role: 'student' });
    await assertFails(deleteDoc(doc(student.firestore(), 'questions', 'q_public_b')));
  });

  it('교사는 학생 질문을 삭제할 수 있다', async () => {
    const teacher = testEnv.authenticatedContext('teacher1', { role: 'teacher' });
    await assertSucceeds(deleteDoc(doc(teacher.firestore(), 'questions', 'q_public_b')));
  });

  it('학생이 stats 문서를 읽으면 거부된다', async () => {
    const alice = testEnv.authenticatedContext('studentA', { role: 'student' });
    const db = alice.firestore();
    await assertFails(getDoc(doc(db, 'stats', 'weekly_2026_37')));
  });

  it('교사는 위 전부가 허용된다 (비공개 글 읽기, 조건 없는 조회, stats 읽기)', async () => {
    const teacher = testEnv.authenticatedContext('teacher1', { role: 'teacher' });
    const db = teacher.firestore();
    
    // Read B's private question
    await assertSucceeds(getDoc(doc(db, 'questions', 'q_private_b')));
    
    // Read list without conditions
    await assertSucceeds(getDocs(collection(db, 'questions')));
    
    // Read stats
    await assertSucceeds(getDoc(doc(db, 'stats', 'weekly_2026_37')));

    // Read B's private question image
    const storage = teacher.storage();
    const fileRef = ref(storage, 'questions/studentB/q_private_b/test.jpg');
    // Note: this succeeds if file exists, if not it fails with object-not-found, which means permission was granted.
    try {
      await getBytes(fileRef);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'storage/unauthorized') {
        throw new Error('Teacher should have access, but got unauthorized');
      }
      if (code !== 'storage/object-not-found') throw e;
    }
  });
});
