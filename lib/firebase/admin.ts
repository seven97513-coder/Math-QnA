import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountString) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  }

  const json = JSON.parse(serviceAccountString) as Record<string, string>;
  const serviceAccount = {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key?.replace(/\\n/g, '\n'),
  };

  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ?? `${serviceAccount.projectId}.firebasestorage.app`,
  });
}

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    const auth = getAuth(getAdminApp());
    const val = (auth as any)[prop];
    return typeof val === 'function' ? val.bind(auth) : val;
  },
});

export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    const db = getFirestore(getAdminApp());
    const val = (db as any)[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  },
});

export const adminStorage = new Proxy({} as Storage, {
  get(_, prop) {
    const storage = getStorage(getAdminApp());
    const val = (storage as any)[prop];
    return typeof val === 'function' ? val.bind(storage) : val;
  },
});
