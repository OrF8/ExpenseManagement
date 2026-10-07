/**
 * Firestore operations for boards.
 * Boards collection: boards/{boardId}
 * Board document shape:
 *   { id, title, ownerUid, memberUids: string[], directMemberUids: string[], createdAt }
 *
 * Access model:
 *   directMemberUids – users explicitly invited to this specific board
 *   memberUids       – effective access: directMemberUids ∪ inherited access from ancestor boards
 *                      (used by Firestore queries; maintained in sync by Cloud Functions)
 *
 * Invites subcollection: boards/{boardId}/invites/{inviteId}
 * Invite document shape:
 *   { boardId, boardTitle, invitedByUid, invitedByEmail, invitedEmail, invitedEmailLower, createdAt, expiresAt }
 *
 * Invitation lifecycle:
 *   - A document's existence means the invitation is pending.
 *   - Accepted/rejected invitations are deleted immediately.
 *   - `expiresAt` is set to createdAt + 24 hours for Firestore TTL auto-deletion.
 *   - App logic also enforces expiry: invitations with expiresAt <= now are ignored.
 */
import {
  collection,
  collectionGroup,
  doc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const boardsRef = () => collection(db, 'boards');

/**
 * Create a new board owned by the current user.
 * @param {string} title - Board title
 * @param {string} uid - Owner's UID
 * @returns {Promise<DocumentReference>}
 */
export async function createBoard(title, _uid, currency = 'ILS', parentBoardId = null) {
  const result = await httpsCallable(functions, 'createBoard')({title, currency, parentBoardId});
  window.dispatchEvent(new Event('boards-changed'));
  return result.data;
}

export async function changeBoardCurrency(boardId, currency, expectedCurrencyRevision) {
  return httpsCallable(functions, 'changeBoardCurrency')({boardId, currency, expectedCurrencyRevision, confirmReplaceConversions: true});
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
 * Delete a board and all its subcollections (owner only).
 * Delegates to the `deleteBoard` Cloud Function which verifies ownership
 * and removes all invite and transaction documents before deleting the
 * board document.
 *
 * @param {string} boardId
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteBoard(boardId) {
  const fn = httpsCallable(functions, 'deleteBoard');
  const result = await fn({ boardId });
  window.dispatchEvent(new Event('boards-changed'));
  return result.data;
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
 * Validation and persistence are handled by the secure createBoardInvite
 * callable function to avoid client-side reads from /users.
 * @param {string} boardId
 * @param {string} email - Raw email entered by the owner (will be normalized)
 * @param {{ email: string }} currentUser - Firebase Auth user object
 * @returns {Promise<{ success: boolean, inviteId: string }>}
 */
export async function createBoardInvite(boardId, email, currentUser) {
  const normalizedEmail = email.trim().toLowerCase();

  // Basic email format validation
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('כתובת הדוא״ל שהוזנה אינה תקינה');
  }

  // Prevent the board owner from inviting themselves
  if (normalizedEmail === (currentUser.email ?? '').trim().toLowerCase()) {
    throw new Error('לא ניתן להזמין את עצמך ללוח');
  }

  const fn = httpsCallable(functions, 'createBoardInvite');
  try {
    const result = await fn({ boardId, invitedEmail: normalizedEmail });
    return result.data;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'functions/unauthenticated') throw new Error('עליך להתחבר כדי להזמין משתתפים');
    if (code === 'functions/permission-denied') throw new Error('אין לך הרשאה להזמין משתתפים ללוח זה');
    if (code === 'functions/not-found') throw new Error('הלוח לא נמצא');
    if (code === 'functions/already-exists') throw new Error('כבר קיימת הזמנה פתוחה לכתובת זו');
    if (code === 'functions/invalid-argument') throw new Error('כתובת הדוא״ל שהוזנה אינה תקינה');
    if (code === 'functions/failed-precondition') throw new Error(err?.message || 'לא ניתן ליצור הזמנה');
    throw new Error('יצירת ההזמנה נכשלה. נסה שוב');
  }
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
 * Subscribe to real-time updates of pending (non-expired) invites addressed to a specific email.
 * Uses a collection-group query across all boards' invites subcollections.
 *
 * The query intentionally uses only a single equality filter on `invitedEmailLower`
 * so that Firestore's automatically-created single-field collection-group index is
 * sufficient — no custom composite index needs to be deployed.
 * Expiry filtering and chronological sorting are done client-side.
 *
 * Backward compatibility: documents without `expiresAt` (legacy) are treated as active.
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
      const now = Date.now();
      const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const invites = allDocs
        .filter((inv) => {
          // A document's existence means it is pending.
          // Exclude documents that have already expired (expiresAt <= now).
          // Legacy documents without expiresAt are treated as active.
          if (!inv.expiresAt) return true;
          return inv.expiresAt.toMillis() > now;
        })
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
  window.dispatchEvent(new Event('boards-changed'));
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
  window.dispatchEvent(new Event('boards-changed'));
  return result.data;
}

// ---------------------------------------------------------------------------
// Board hierarchy helpers
//
// Extended board document shape (new optional fields):
//   parentBoardId    : string | null  – ID of the containing super board, or null
//   subBoardIds      : legacy cache; ignored (parentBoardId is authoritative)
//   directMemberUids : string[]       – users explicitly invited to this board
//
// Access model: membership flows DOWN the hierarchy (parent → descendants).
//   - directMemberUids: explicitly invited users
//   - memberUids: effective access = direct ∪ inherited from all ancestors
//   - Being in a sub-board's directMemberUids does NOT grant access to the parent.
//
// Existing boards without these fields behave as regular top-level boards.
// ---------------------------------------------------------------------------

/**
 * Update arbitrary fields on a board document (owner only).
 * @param {string} boardId
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function updateBoard(boardId, data) {
  const ref = doc(db, 'boards', boardId);
  return updateDoc(ref, data);
}

/**
 * Rename a board (owner only).
 * Validates that the title is non-empty after trimming.
 * @param {string} boardId
 * @param {string} newTitle
 * @returns {Promise<void>}
 */
export async function renameBoard(boardId, newTitle) {
  const trimmed = (newTitle ?? '').trim();
  if (!trimmed) throw new Error('שם הלוח אינו יכול להיות ריק');
  return updateBoard(boardId, { title: trimmed });
}

/** Authoritative atomic re-parenting; null moves a subtree to root. */
export async function mergeBoardsIntoSuper(childId, parentId) {
  const result = await httpsCallable(functions, 'reparentBoard')({boardId: childId, parentBoardId: parentId});
  window.dispatchEvent(new Event('boards-changed'));
  return result;
}
export async function removeSubBoardFromSuper(_superBoardId, subBoardId) {
  return mergeBoardsIntoSuper(subBoardId, null);
}
export async function getHierarchySummary(boardId, includeTransactions = false) {
  const result = await httpsCallable(functions, 'getHierarchySummary')({boardId, includeTransactions});
  return result.data;
}
export function subscribeToChildBoards(boardId, uid, onData, onError) {
  return onSnapshot(query(boardsRef(), where('parentBoardId', '==', boardId), where('memberUids', 'array-contains', uid)),
    snap => onData(snap.docs.map(d => ({...d.data(), id: d.id}))), onError);
}
