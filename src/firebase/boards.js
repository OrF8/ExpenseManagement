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
 *   { boardId, boardTitle, invitedByUid, invitedByEmail, invitedEmail, invitedEmailLower,
 *     invitedUid, createdAt, expiresAt }
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
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
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
    directMemberUids: [uid],
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
  return result.data;
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
 * is not already a board member, and that no active (non-expired) invite exists.
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

  // Prevent duplicate active (non-expired) invites for the same user (by UID).
  // Expired docs may still physically exist until TTL removes them, so we check
  // expiresAt client-side.  Documents without expiresAt (legacy) are treated as active.
  const duplicateQ = query(invitesRef, where('invitedUid', '==', targetProfile.uid));
  const existing = await getDocs(duplicateQ);
  const now = Date.now();
  const hasActiveInvite = existing.docs.some((d) => {
    const data = d.data();
    const expiresAt = data.expiresAt;
    if (!expiresAt) return true; // legacy doc without expiry — treat as active
    return expiresAt.toMillis() > now;
  });
  if (hasActiveInvite) {
    throw new Error('כבר קיימת הזמנה פתוחה למשתמש זה');
  }

  const createdAt = serverTimestamp();
  // Note: expiresAt is derived from the client clock (Date.now()) and is used
  // for TTL auto-deletion and client-side filtering only. It may be affected
  // by clock skew or user tampering, so any authoritative expiry checks
  // should be enforced via server-side logic or security rules.
  const expiresAt = Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);

  return addDoc(invitesRef, {
    boardId,
    boardTitle,
    invitedByUid: currentUser.uid,
    invitedByEmail: currentUser.email ?? null,
    invitedEmail: normalizedEmail,
    invitedEmailLower: normalizedEmail,
    invitedUid: targetProfile.uid,
    createdAt,
    expiresAt,
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

// ---------------------------------------------------------------------------
// Board hierarchy helpers
//
// Extended board document shape (new optional fields):
//   parentBoardId    : string | null  – ID of the containing super board, or null
//   subBoardIds      : string[]       – ordered list of direct child board IDs
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

/**
 * Attach childId as a sub-board of parentId, cascading inherited membership.
 *
 * - Adds childId to parentId's subBoardIds.
 * - Sets parentBoardId on the child board.
 * - Adds all current members of the parent to the child's memberUids (inherited
 *   access flows DOWN only: parent → child).
 * - Does NOT update directMemberUids of the child — that reflects only explicit
 *   invitations, not inherited access.
 * - Does NOT add the child's members to the parent (access does not flow UP).
 *
 * Callers must validate that the merge is safe (no cycles, correct ownership)
 * before calling this function.  Both boards must be owned by the same user.
 *
 * @param {string} childId
 * @param {string} parentId
 * @returns {Promise<void>}
 */
export async function mergeBoardsIntoSuper(childId, parentId) {
  const childRef = doc(db, 'boards', childId);
  const parentRef = doc(db, 'boards', parentId);

  // Read current member list of the parent so we can cascade inherited access
  const parentSnap = await getDoc(parentRef);
  const parentMembers = parentSnap.data()?.memberUids ?? [];

  await Promise.all([
    updateDoc(parentRef, {
      subBoardIds: arrayUnion(childId),
    }),
    updateDoc(childRef, {
      parentBoardId: parentId,
      // Cascade parent members → child memberUids (inherited access, not direct)
      ...(parentMembers.length > 0 ? { memberUids: arrayUnion(...parentMembers) } : {}),
    }),
  ]);
}

/**
 * Detach a sub-board from its super board, making it a top-level board again.
 *
 * Implements Option B: collaborators who had only inherited access
 * (in memberUids but NOT in directMemberUids) lose that access when the board
 * is detached — their access came from the parent and disappears with it.
 * Only users with direct membership (directMemberUids) remain on the board.
 *
 * Does NOT delete the sub-board or any of its data.
 *
 * @param {string} superBoardId
 * @param {string} subBoardId
 * @returns {Promise<void>}
 */
export async function removeSubBoardFromSuper(superBoardId, subBoardId) {
  const superRef = doc(db, 'boards', superBoardId);
  const subRef = doc(db, 'boards', subBoardId);

  // Read the sub-board to identify inherited-only members
  const subSnap = await getDoc(subRef);
  const subData = subSnap.data() ?? {};
  const allMembers = subData.memberUids ?? [];
  // Backward compat: if directMemberUids is absent treat everyone as direct
  const directMembers = subData.directMemberUids ?? allMembers;
  const inheritedOnly = allMembers.filter((uid) => !directMembers.includes(uid));

  await Promise.all([
    updateDoc(superRef, { subBoardIds: arrayRemove(subBoardId) }),
    updateDoc(subRef, {
      parentBoardId: null,
      // Remove inherited-only members from memberUids: their access was via the
      // parent board and should disappear when the board is detached.
      ...(inheritedOnly.length > 0 ? { memberUids: arrayRemove(...inheritedOnly) } : {}),
    }),
  ]);
}
