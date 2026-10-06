/**
 * Firebase Authentication helper functions.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, googleProvider, functions } from './config';
import { createUserProfile, getUserProfile } from './users';

/** Apply the selected persistence before starting any authentication operation. */
function setAuthPersistence(rememberMe) {
  return setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
}

/** Sign up with email, password, and a display nickname */
export async function signUp(email, password, nickname, rememberMe = true) {
  await setAuthPersistence(rememberMe);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await createUserProfile(credential.user.uid, email, nickname);
  return credential;
}

/** Sign in with email and password */
export async function signIn(email, password, rememberMe = true) {
  await setAuthPersistence(rememberMe);
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign in with Google popup, creating a Firestore profile if one does not yet exist */
export async function signInWithGoogle(rememberMe = true) {
  await setAuthPersistence(rememberMe);
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

/** Send a password-reset email to the given address */
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Permanently delete the current user's account and all associated data.
 *
 * Delegates to the `deleteMyAccount` Cloud Function which:
 *   - Verifies authentication server-side (UID is never provided by the client)
 *   - Deletes every board owned by the user and all descendant boards,
 *     including their subcollections (invites, transactions)
 *   - Removes the user from memberUids/directMemberUids on boards they do not own
 *   - Deletes the user's Firestore profile document
 *   - Deletes the Firebase Auth user record
 *
 * After the server confirms deletion, clear the local Firebase Auth session
 * before returning so route guards cannot observe a stale deleted user.
 *
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteMyAccount() {
  const fn = httpsCallable(functions, 'deleteMyAccount');
  const result = await fn();
  await signOut(auth);
  return result.data;
}
