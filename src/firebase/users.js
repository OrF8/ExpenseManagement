/**
 * Firestore operations for user profiles.
 * Collection: users/{uid}
 * Document shape:
 *   { email, emailLower, nickname, createdAt }
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

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
 * Fetch multiple user profiles by an array of UIDs.
 * Missing profiles are returned as a safe fallback object.
 * @param {string[]} uids
 * @returns {Promise<Array<{uid: string, nickname: string, email: string}>>}
 */
export async function getUserProfilesByUids(uids) {
  const profiles = await Promise.all(uids.map(getUserProfile));
  return profiles.map((profile, i) =>
    profile ?? { uid: uids[i], nickname: 'משתמש', email: '' }
  );
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

/**
 * Fetch a user profile by email address.
 * Email is normalized to lowercase/trimmed before querying.
 * @param {string} email
 * @returns {Promise<{uid: string, ...}|null>}
 */
export async function getUserProfileByEmail(email) {
  const emailLower = email.trim().toLowerCase();
  const q = query(
    collection(db, 'users'),
    where('emailLower', '==', emailLower)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() };
}
