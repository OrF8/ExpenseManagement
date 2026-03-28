/**
 * Firestore operations for boards.
 * Boards collection: boards/{boardId}
 * Board document shape:
 *   { id, title, ownerUid, memberUids: string[], createdAt }
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './config';

const boardsRef = () => collection(db, 'boards');

/**
 * Create a new board owned by the current user.
 * @param {string} title - Board title
 * @param {string} uid - Owner's UID
 * @returns {Promise<DocumentReference>}
 */
export async function createBoard(title, uid) {
  return addDoc(boardsRef(), {
    title,
    ownerUid: uid,
    memberUids: [uid],
    createdAt: serverTimestamp(),
  });
}

/**
 * Subscribe to real-time updates of boards the user belongs to.
 * @param {string} uid - User UID
 * @param {function} onData - Callback receiving array of board objects
 * @param {function} onError - Error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToBoards(uid, onData, onError) {
  console.log('[boards] subscribing for uid:', uid);
  const q = query(boardsRef(), where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      console.log('[boards] snapshot size:', snap.size);
      const boards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log('[boards] mapped boards:', boards);
      onData(boards);
    },
    (err) => {
      console.error('[boards] subscription error:', err);
      onError(err);
    }
  );
}

/**
 * Add a collaborator (by UID) to a board.
 * @param {string} boardId
 * @param {string} collaboratorUid
 */
export async function addCollaborator(boardId, collaboratorUid) {
  const ref = doc(db, 'boards', boardId);
  return updateDoc(ref, {
    memberUids: arrayUnion(collaboratorUid),
  });
}

/**
 * Delete a board (owner only; enforce via security rules).
 * @param {string} boardId
 */
export async function deleteBoard(boardId) {
  const ref = doc(db, 'boards', boardId);
  return deleteDoc(ref);
}

/**
 * Fetch a single board by ID.
 * @param {string} boardId
 * @returns {Promise<{id: string, ...}>|null}
 */
export async function getBoard(boardId) {
  const ref = doc(db, 'boards', boardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
