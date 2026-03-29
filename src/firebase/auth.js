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
import { createUserProfile } from './users';

/** Sign up with email, password, and a display nickname */
export async function signUp(email, password, nickname) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await createUserProfile(credential.user.uid, email, nickname);
  return credential;
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
