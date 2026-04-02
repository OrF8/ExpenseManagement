/**
 * Firestore operations for user profiles.
 * Collection: users/{uid}
 * Document shape:
 *   { email, emailLower, nickname, createdAt }
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

/**
 * Create a user profile document in Firestore.
 * @param {string} uid - Firebase Auth UID
 * @param {string} email - User's email address
 * @param {string} nickname - Display nickname
 * @returns {Promise<void>}
 */
export async function createUserProfile(uid, email, nickname) {
  const ref = doc(db, 'users', uid);
  return setDoc(ref, {
    email,
    emailLower: email.trim().toLowerCase(),
    nickname: nickname.trim(),
    createdAt: serverTimestamp(),
  });
}

/**
 * Fetch a user profile by UID.
 * @param {string} uid
 * @returns {Promise<{uid: string, ...}|null>}
 */
export async function getUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() };
}

/**
 * Fetch multiple user display profiles for a specific board by an array of UIDs.
 * Uses a callable Cloud Function so the client does not read other users' /users docs directly.
 * Missing profiles are returned as a safe fallback object.
 * @param {string} boardId
 * @param {string[]} uids
 * @returns {Promise<Array<{uid: string, nickname: string, email: string}>>}
 */
export async function getUserProfilesByUids(boardId, uids) {
  const fn = httpsCallable(functions, 'getBoardCollaboratorProfiles');
  const result = await fn({ boardId, uids });
  const profiles = result?.data?.profiles ?? [];
  return Array.isArray(profiles) ? profiles : [];
}

/**
 * Update a user's nickname in Firestore.
 * @param {string} uid - Firebase Auth UID
 * @param {string} nickname - New nickname (must be non-empty after trimming)
 * @returns {Promise<void>}
 */
export async function updateNickname(uid, nickname) {
  const trimmed = nickname.trim();
  if (!trimmed) throw new Error('הכינוי לא יכול להיות ריק.');
  const ref = doc(db, 'users', uid);
  return updateDoc(ref, { nickname: trimmed });
}
