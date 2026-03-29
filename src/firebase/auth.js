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
import { createUserProfile, getUserProfile } from './users';

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

/** Sign in with Google popup, creating a Firestore profile if one does not yet exist */
export async function signInWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  const { user } = credential;

  const existing = await getUserProfile(user.uid);
  if (!existing) {
    if (!user.email) {
      throw new Error('Google sign-in succeeded but no email is available; cannot create profile.');
    }

    const displayName = (user.displayName || '').trim();
    const nickname =
      displayName ||
      user.email.split('@')[0] ||
      'משתמש';

    await createUserProfile(user.uid, user.email, nickname);
  }

  return credential;
}

/** Sign out the current user */
export async function logOut() {
  return signOut(auth);
}
