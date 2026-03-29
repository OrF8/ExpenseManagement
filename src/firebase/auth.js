/**
 * Firebase Authentication helper functions.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from './config';

/** Sign up with email and password */
export async function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Sign in with email and password */
export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign in with Google popup */
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/** Sign out the current user */
export async function logOut() {
  return signOut(auth);
}
