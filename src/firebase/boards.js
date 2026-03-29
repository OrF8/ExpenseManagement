/**
 * Firestore operations for boards.
 * Boards collection: boards/{boardId}
 * Board document shape:
 *   { id, title, ownerUid, memberUids: string[], createdAt }
 *
 * Invites subcollection: boards/{boardId}/invites/{inviteId}
 * Invite document shape:
 *   { boardId, boardTitle, invitedByUid, invitedByEmail, invitedEmail, invitedEmailLower,
 *     status, createdAt, acceptedAt, declinedAt }
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

// ---------------------------------------------------------------------------
// Invite helpers — boards/{boardId}/invites/{inviteId}
//
// Invite acceptance and decline are handled by the secure Cloud Functions
// `acceptBoardInvite` and `declineBoardInvite` (see functions/index.js).
// Clients call those functions via src/firebase/invites.js wrappers.
//
// NOTE (user verification): createBoardInvite validates email *format* only.
// There is no users/profiles collection in this app, so it is not possible to
// verify that the invited email belongs to an existing account before writing
// the invite document.  Owners can therefore create pending invite records for
// any well-formed email address, even one with no account.  Recipients who do
// have an account will see the invite in the UI and can accept or decline it
// via the Cloud Functions.  Recipients without an account will never see the
// invite.  Server-side email verification (e.g. a Cloud Function that looks up
// the email in Firebase Auth) would improve the experience but is not yet
// implemented.
// ---------------------------------------------------------------------------

/**
 * Create a pending invite for a collaborator by email.
 * Prevents duplicate pending invites for the same board/email.
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

  const invitesRef = collection(db, 'boards', boardId, 'invites');

  // Prevent duplicate pending invites for the same email
  const duplicateQ = query(
    invitesRef,
    where('invitedEmailLower', '==', normalizedEmail),
    where('status', '==', 'pending')
  );
  const existing = await getDocs(duplicateQ);
  if (!existing.empty) {
    throw new Error('כבר קיימת הזמנה פתוחה לכתובת דוא״ל זו');
  }

  return addDoc(invitesRef, {
    boardId,
    boardTitle,
    invitedByUid: currentUser.uid,
    invitedByEmail: currentUser.email ?? null,
    invitedEmail: normalizedEmail,
    invitedEmailLower: normalizedEmail,
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
