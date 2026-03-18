
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDGFU_n4RQ007fqvXdoHIRFo1uTc6egCeM",
  authDomain: "vidalert-93e0f.firebaseapp.com",
  projectId: "vidalert-93e0f",
  storageBucket: "vidalert-93e0f.firebasestorage.app",
  messagingSenderId: "1060158066603",
  appId: "1:1060158066603:web:65a94f04c99ea257604cee"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;