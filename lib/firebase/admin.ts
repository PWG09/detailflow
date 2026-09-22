import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function requiredServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

const adminApp = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId: requiredServerEnv('FIREBASE_ADMIN_PROJECT_ID'),
    clientEmail: requiredServerEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
    privateKey: requiredServerEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);
