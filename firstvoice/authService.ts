import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { auth } from './firebaseConfig';

// Registro
export const registerUser = async (email: string, password: string) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;
  const token = await userCredential.user.getIdToken();
  return { uid, token };
};

// Login
export const loginUser = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;
  const token = await userCredential.user.getIdToken();
  return { uid, token };
};

// Logout
export const logoutUser = () => signOut(auth);

// Token para llamadas al backend
export const getToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(true);
};