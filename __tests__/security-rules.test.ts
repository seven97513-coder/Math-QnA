import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
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
    } catch (e: any) {
      if (e.code === 'storage/unauthorized') {
        throw new Error('Teacher should have access, but got unauthorized');
      }
      if (e.code !== 'storage/object-not-found') throw e;
    }
  });
});
