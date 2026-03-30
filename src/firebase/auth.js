/**
 * Firebase Authentication helper functions.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  sendPasswordResetEmail,
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

/**
 * Creates a Firestore profile for a Google-authenticated user if one does not
 * yet exist. Shared by both the popup and redirect sign-in flows.
 */
async function ensureGoogleUserProfile(user) {
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
}

/**
 * Sign in with Google using a popup window.
 *
 * If the popup is blocked by the browser (e.g. Brave with shields enabled) or
 * is not supported in the current environment, the function automatically falls
 * back to a full-page redirect flow.  When a redirect is started this function
 * returns `null` — the page will reload after Google redirects back, and the
 * sign-in must be completed by calling `getGoogleRedirectResult()` on the next
 * page load.
 *
 * @returns {Promise<import('firebase/auth').UserCredential | null>}
 */
export async function signInWithGoogle() {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    await ensureGoogleUserProfile(credential.user);
    return credential;
  } catch (err) {
    // Popup was blocked by the browser or is unsupported — fall back to a
    // full-page redirect so the user can still authenticate.
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      console.warn('[Auth] Popup blocked or unsupported, falling back to redirect sign-in:', err.code);
      await signInWithRedirect(auth, googleProvider);
      return null; // page will reload; result handled by getGoogleRedirectResult
    }

    console.error('[Auth] Google sign-in error:', err.code, err.message);
    throw err;
  }
}

/**
 * Checks for a pending Google redirect sign-in result and completes sign-in.
 *
 * Call this once when the auth page mounts to handle returning users after a
 * `signInWithRedirect` flow.  Returns `null` when there is no pending result.
 *
 * @returns {Promise<import('firebase/auth').UserCredential | null>}
 */
export async function getGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      await ensureGoogleUserProfile(result.user);
    }
    return result;
  } catch (err) {
    console.error('[Auth] Google redirect result error:', err.code, err.message);
    throw err;
  }
}

/** Sign out the current user */
export async function logOut() {
  return signOut(auth);
}

/** Send a password-reset email to the given address */
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}
