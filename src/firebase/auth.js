/**
 * Firebase Authentication helper functions.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, googleProvider, functions } from './config';
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
 * After this call succeeds the auth session is invalidated; the caller should
 * redirect to the sign-in / landing screen and clear any local state.
 *
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteMyAccount() {
  const fn = httpsCallable(functions, 'deleteMyAccount');
  const result = await fn();
  return result.data;
}
