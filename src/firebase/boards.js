/**
 * Firestore operations for boards.
 * Boards collection: boards/{boardId}
 * Board document shape:
 *   { id, title, ownerUid, memberUids: string[], createdAt }
 *
 * Invites subcollection: boards/{boardId}/invites/{inviteId}
 * Invite document shape:
 *   { boardId, boardTitle, invitedByUid, invitedByEmail, invitedEmail, invitedEmailLower,
 *     invitedUid, status, createdAt, acceptedAt, declinedAt }
 */
import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { getUserProfileByEmail } from './users';

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
  const q = query(boardsRef(), where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const boards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(boards);
    },
    (err) => {
      onError(err);
    }
  );
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

/**
 * Subscribe to real-time updates of a single board document.
 * @param {string} boardId
 * @param {function} onData  - Callback receiving the board object, or null if it no longer exists
 * @param {function} onError - Error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToBoard(boardId, onData, onError) {
  const ref = doc(db, 'boards', boardId);
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    onError
  );
}

// ---------------------------------------------------------------------------
// Invite helpers — boards/{boardId}/invites/{inviteId}
//
// Invite acceptance and decline are handled by the secure Cloud Functions
// `acceptBoardInvite` and `declineBoardInvite` (see functions/index.js).
// Clients call those functions via src/firebase/invites.js wrappers.
// ---------------------------------------------------------------------------

/**
 * Create a pending invite for a collaborator by email.
 * Validates that the target email belongs to a registered user, that the user
 * is not already a board member, and that no pending invite exists for them.
 * @param {string} boardId
 * @param {string} email - Raw email entered by the owner (will be normalised)
 * @param {{ uid: string, email: string }} currentUser - Firebase Auth user object
 * @param {string} [boardTitle=''] - Title of the board being shared
 * @returns {Promise<DocumentReference>}
 */
export async function createBoardInvite(boardId, email, currentUser, boardTitle = '') {
  const normalizedEmail = email.trim().toLowerCase();

  // Basic email format validation
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('כתובת הדוא״ל שהוזנה אינה תקינה');
  }

  // Prevent the board owner from inviting themselves
  if (normalizedEmail === (currentUser.email ?? '').trim().toLowerCase()) {
    throw new Error('לא ניתן להזמין את עצמך ללוח');
  }

  // Resolve target user from the users collection
  const targetProfile = await getUserProfileByEmail(normalizedEmail);
  if (!targetProfile) {
    throw new Error('לא נמצא משתמש רשום עם כתובת דוא״ל זו');
  }

  // Reject if the resolved user is already a board member
  const board = await getBoard(boardId);
  if (!board) {
    throw new Error('הלוח לא נמצא');
  }
  if (board.memberUids?.includes(targetProfile.uid)) {
    throw new Error('משתמש זה כבר חבר בלוח');
  }

  const invitesRef = collection(db, 'boards', boardId, 'invites');

  // Prevent duplicate pending invites for the same user (by UID)
  const duplicateQ = query(
    invitesRef,
    where('invitedUid', '==', targetProfile.uid),
    where('status', '==', 'pending')
  );
  const existing = await getDocs(duplicateQ);
  if (!existing.empty) {
    throw new Error('כבר קיימת הזמנה פתוחה למשתמש זה');
  }

  return addDoc(invitesRef, {
    boardId,
    boardTitle,
    invitedByUid: currentUser.uid,
    invitedByEmail: currentUser.email ?? null,
    invitedEmail: normalizedEmail,
    invitedEmailLower: normalizedEmail,
    invitedUid: targetProfile.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
    acceptedAt: null,
    declinedAt: null,
  });
}

/**
 * Subscribe to real-time updates of all invites for a board.
 * @param {string} boardId
 * @param {function} onData - Callback receiving array of invite objects
 * @param {function} onError - Error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToBoardInvites(boardId, onData, onError) {
  const invitesRef = collection(db, 'boards', boardId, 'invites');
  return onSnapshot(
    invitesRef,
    (snap) => {
      const invites = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(invites);
    },
    onError
  );
}

/**
 * Subscribe to real-time updates of pending invites addressed to a specific email.
 * Uses a collection-group query across all boards' invites subcollections.
 *
 * The query intentionally uses only a single equality filter on `invitedEmailLower`
 * so that Firestore's automatically-created single-field collection-group index is
 * sufficient — no custom composite index needs to be deployed.  Adding a second
 * `where('status', '==', 'pending')` or an `orderBy('createdAt', 'desc')` clause
 * would require a manually-created collection-group composite index on
 * (invitedEmailLower, status, createdAt); without it the query fails with a
 * "requires an index" error that surfaces to the user as an empty list.
 * Status filtering and chronological sorting are therefore done client-side below.
 *
 * @param {string} email - The invited user's email (will be normalized to lowercase)
 * @param {function} onData - Callback receiving array of pending invite objects
 * @param {function} onError - Error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToIncomingInvites(email, onData, onError) {
  const emailLower = email.trim().toLowerCase();
  const q = query(
    collectionGroup(db, 'invites'),
    where('invitedEmailLower', '==', emailLower)
  );
  return onSnapshot(
    q,
    (snap) => {
      const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const invites = allDocs
        .filter((inv) => inv.status === 'pending')
        .sort((a, b) => {
          const aMs = a.createdAt?.toMillis?.() ?? 0;
          const bMs = b.createdAt?.toMillis?.() ?? 0;
          return bMs - aMs;
        });
      onData(invites);
    },
    onError
  );
}

/**
 * Delete (revoke) a board invite.
 * @param {string} boardId
 * @param {string} inviteId
 */
export async function deleteBoardInvite(boardId, inviteId) {
  const ref = doc(db, 'boards', boardId, 'invites', inviteId);
  return deleteDoc(ref);
}

/**
 * Remove a member from a board (owner only).
 * Delegates to the `removeBoardMember` Cloud Function which enforces all
 * permission and safety checks server-side.
 *
 * @param {string} boardId   - ID of the board document
 * @param {string} memberUid - UID of the member to remove
 * @returns {Promise<{ success: boolean }>}
 */
export async function removeBoardMember(boardId, memberUid) {
  const fn = httpsCallable(functions, 'removeBoardMember');
  const result = await fn({ boardId, memberUid });
  return result.data;
}

/**
 * Leave a board as a non-owner member.
 * Delegates to the `leaveBoard` Cloud Function which enforces all permission
 * and safety checks server-side.
 *
 * @param {string} boardId - ID of the board document
 * @returns {Promise<{ success: boolean }>}
 */
export async function leaveBoard(boardId) {
  const fn = httpsCallable(functions, 'leaveBoard');
  const result = await fn({ boardId });
  return result.data;
}
