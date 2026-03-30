/**
 * Firebase Cloud Functions for Expense Management.
 *
 * Callable functions:
 *   - acceptBoardInvite  : atomically adds the caller to board memberUids/directMemberUids and marks invite accepted;
 *                          also cascades memberUids addition to all descendant boards (inherited access)
 *   - declineBoardInvite : marks the invite as declined
 *   - removeBoardMember  : allows the board owner to remove a non-owner member from the board;
 *                          cascades removal from descendants unless user has direct access there
 *   - leaveBoard         : allows a non-owner member to remove themselves from a board;
 *                          cascades removal from descendants unless user has direct access there
 *   - deleteBoard        : allows the board owner to fully delete a board and all its subcollections (invites, transactions)
 *
 * ## Access model
 * Each board document has two membership fields:
 *   - directMemberUids : users explicitly invited to this specific board
 *   - memberUids       : all users with effective access = direct ∪ inherited from ancestor boards
 *                        (used by Firestore queries; kept in sync by these functions)
 *
 * Access flows DOWN the hierarchy: being a member of a super board grants access to all descendants.
 * Access does NOT flow up: being a direct member of a sub-board does NOT grant access to its parent.
 *
 * Backward compatibility: boards created before directMemberUids was introduced treat all memberUids
 * as direct (directMemberUids falls back to memberUids when absent).
 *
 * All functions run with the Firebase Admin SDK and therefore bypass Firestore
 * security rules.  All authorization checks are enforced in the function body.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collect all descendant board IDs starting from the given board, depth-first.
 * Follows the subBoardIds field on each board document.
 * Cycle-safe via a visited Set.
 *
 * @param {string} boardId
 * @returns {Promise<string[]>}
 */
async function getDescendantBoardIds(boardId) {
  const visited = new Set();
  const result = [];

  async function traverse(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const snap = await db.collection('boards').doc(id).get();
    if (!snap.exists) return;
    const subIds = snap.data().subBoardIds || [];
    for (const subId of subIds) {
      result.push(subId);
      await traverse(subId);
    }
  }

  await traverse(boardId);
  return result;
}

/**
 * acceptBoardInvite
 *
 * Callable function that allows an authenticated user to accept a board invite
 * addressed to their email.  The operation is performed inside a Firestore
 * transaction so that the invite status update and the memberUids array-union
 * are always atomic.
 *
 * After the transaction, the caller's UID is also added to the memberUids of
 * every descendant board (inherited access), WITHOUT updating directMemberUids
 * on those descendants — access flows down from the parent.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId  - ID of the board document
 * @param {string} request.data.inviteId - ID of the invite document
 */
exports.acceptBoardInvite = onCall(async (request) => {
  // 1. Require authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לקבל הזמנה');
  }

  const uid = request.auth.uid;
  const callerEmail = (request.auth.token.email || '').toLowerCase();

  const { boardId, inviteId } = request.data || {};
  if (!boardId || !inviteId) {
    throw new HttpsError('invalid-argument', 'boardId ו-inviteId נדרשים');
  }

  const inviteRef = db.collection('boards').doc(boardId).collection('invites').doc(inviteId);
  const boardRef = db.collection('boards').doc(boardId);

  await db.runTransaction(async (tx) => {
    // 2. Load and verify the invite document
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new HttpsError('not-found', 'ההזמנה לא נמצאה');
    }

    const invite = inviteSnap.data();

    // 3. Verify invite is still pending
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'ההזמנה אינה ממתינה לאישור');
    }

    // 4. Verify caller email matches the invite
    if ((invite.invitedEmailLower || '') !== callerEmail) {
      throw new HttpsError('permission-denied', 'אין לך הרשאה לקבל הזמנה זו');
    }

    // 5. Load the board document inside the same transaction
    const boardSnap = await tx.get(boardRef);
    if (!boardSnap.exists) {
      throw new HttpsError('not-found', 'הלוח לא נמצא');
    }

    const board = boardSnap.data();
    const memberUids = board.memberUids || [];

    // 6. Atomically update invite status and add UID to board (no duplication)
    tx.update(inviteRef, {
      status: 'accepted',
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!memberUids.includes(uid)) {
      // Add to both memberUids (effective access) and directMemberUids (direct membership)
      tx.update(boardRef, {
        memberUids: admin.firestore.FieldValue.arrayUnion(uid),
        directMemberUids: admin.firestore.FieldValue.arrayUnion(uid),
      });
    }
  });

  // 7. Cascade inherited access to all descendant boards (outside the transaction
  //    for scalability).  Only memberUids is updated on descendants — NOT
  //    directMemberUids — because the user is a direct member of this board only.
  const descendantIds = await getDescendantBoardIds(boardId);
  if (descendantIds.length > 0) {
    const results = await Promise.allSettled(
      descendantIds.map((descId) =>
        db.collection('boards').doc(descId).update({
          memberUids: admin.firestore.FieldValue.arrayUnion(uid),
        })
      )
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`acceptBoardInvite: failed to cascade memberUids to descendant ${descendantIds[i]}:`, r.reason);
      }
    });
  }

  return { success: true };
});

/**
 * declineBoardInvite
 *
 * Callable function that allows an authenticated user to decline a board invite
 * addressed to their email.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId  - ID of the board document
 * @param {string} request.data.inviteId - ID of the invite document
 */
exports.declineBoardInvite = onCall(async (request) => {
  // 1. Require authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לדחות הזמנה');
  }

  const callerEmail = (request.auth.token.email || '').toLowerCase();

  const { boardId, inviteId } = request.data || {};
  if (!boardId || !inviteId) {
    throw new HttpsError('invalid-argument', 'boardId ו-inviteId נדרשים');
  }

  const inviteRef = db.collection('boards').doc(boardId).collection('invites').doc(inviteId);

  // 2. Load and verify the invite document
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError('not-found', 'ההזמנה לא נמצאה');
  }

  const invite = inviteSnap.data();

  // 3. Verify invite is still pending
  if (invite.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'ההזמנה אינה ממתינה לאישור');
  }

  // 4. Verify caller email matches the invite
  if ((invite.invitedEmailLower || '') !== callerEmail) {
    throw new HttpsError('permission-denied', 'אין לך הרשאה לדחות הזמנה זו');
  }

  // 5. Mark invite as declined
  await inviteRef.update({
    status: 'declined',
    declinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

/**
 * removeBoardMember
 *
 * Callable function that allows the board owner to remove a non-owner member
 * from the board.  The caller must be authenticated and must be the board owner.
 * The target member must currently be in board.memberUids and must not be the owner.
 *
 * After removing the member from this board, inherited access is cascaded:
 * the member is also removed from every descendant board's memberUids, UNLESS
 * they have direct membership (directMemberUids) on that descendant.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId   - ID of the board document
 * @param {string} request.data.memberUid - UID of the member to remove
 */
exports.removeBoardMember = onCall(async (request) => {
  // 1. Require authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי להסיר חבר');
  }

  const callerUid = request.auth.uid;

  const { boardId, memberUid } = request.data || {};
  if (!boardId || !memberUid) {
    throw new HttpsError('invalid-argument', 'boardId ו-memberUid נדרשים');
  }

  const boardRef = db.collection('boards').doc(boardId);

  // 2. Load the board document
  const boardSnap = await boardRef.get();
  if (!boardSnap.exists) {
    throw new HttpsError('not-found', 'הלוח לא נמצא');
  }

  const board = boardSnap.data();

  // 3. Verify caller is the board owner
  if (board.ownerUid !== callerUid) {
    throw new HttpsError('permission-denied', 'רק בעל הלוח יכול להסיר חברים');
  }

  // 4. Reject if trying to remove the owner
  if (memberUid === board.ownerUid) {
    throw new HttpsError('invalid-argument', 'לא ניתן להסיר את בעל הלוח');
  }

  // 5. Verify the target member is currently on the board
  const memberUids = board.memberUids || [];
  if (!memberUids.includes(memberUid)) {
    throw new HttpsError('not-found', 'המשתמש אינו חבר בלוח');
  }

  // 6. Remove the member from both memberUids and directMemberUids of this board
  await boardRef.update({
    memberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
    directMemberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
  });

  // 7. Cascade: remove inherited access from all descendants,
  //    but only when the member does NOT have direct access on that descendant.
  //    Backward compat: if directMemberUids is absent, treat all memberUids as direct.
  const descendantIds = await getDescendantBoardIds(boardId);
  if (descendantIds.length > 0) {
    const results = await Promise.allSettled(
      descendantIds.map(async (descId) => {
        const descSnap = await db.collection('boards').doc(descId).get();
        if (!descSnap.exists) return;
        const descData = descSnap.data();
        // Fall back to memberUids when directMemberUids is not yet set (backward compat)
        const directMembers = descData.directMemberUids ?? descData.memberUids ?? [];
        if (!directMembers.includes(memberUid)) {
          await db.collection('boards').doc(descId).update({
            memberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
          });
        }
      })
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`removeBoardMember: failed to cascade removal to descendant ${descendantIds[i]}:`, r.reason);
      }
    });
  }

  return { success: true };
});

/**
 * leaveBoard
 *
 * Callable function that allows a non-owner member to remove themselves from a
 * board.  The caller must be authenticated, must be a member of the board, and
 * must not be the board owner.
 *
 * After leaving, the caller's inherited access is cascaded: they are also removed
 * from every descendant board's memberUids, UNLESS they have direct membership
 * (directMemberUids) on that descendant.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId - ID of the board document
 */
exports.leaveBoard = onCall(async (request) => {
  // 1. Require authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לעזוב לוח');
  }

  const callerUid = request.auth.uid;

  const { boardId } = request.data || {};
  if (!boardId) {
    throw new HttpsError('invalid-argument', 'boardId נדרש');
  }

  const boardRef = db.collection('boards').doc(boardId);

  // 2. Load the board document
  const boardSnap = await boardRef.get();
  if (!boardSnap.exists) {
    throw new HttpsError('not-found', 'הלוח לא נמצא');
  }

  const board = boardSnap.data();

  // 3. Reject if the caller is the board owner
  if (board.ownerUid === callerUid) {
    throw new HttpsError('permission-denied', 'בעל הלוח אינו יכול לעזוב את הלוח');
  }

  // 4. Verify the caller is currently a member of the board
  const memberUids = board.memberUids || [];
  if (!memberUids.includes(callerUid)) {
    throw new HttpsError('not-found', 'אינך חבר בלוח זה');
  }

  // 5. Remove the caller from both memberUids and directMemberUids of this board
  await boardRef.update({
    memberUids: admin.firestore.FieldValue.arrayRemove(callerUid),
    directMemberUids: admin.firestore.FieldValue.arrayRemove(callerUid),
  });

  // 6. Cascade: remove inherited access from all descendants,
  //    but only when the caller does NOT have direct access on that descendant.
  //    Backward compat: if directMemberUids is absent, treat all memberUids as direct.
  const descendantIds = await getDescendantBoardIds(boardId);
  if (descendantIds.length > 0) {
    const results = await Promise.allSettled(
      descendantIds.map(async (descId) => {
        const descSnap = await db.collection('boards').doc(descId).get();
        if (!descSnap.exists) return;
        const descData = descSnap.data();
        // Fall back to memberUids when directMemberUids is not yet set (backward compat)
        const directMembers = descData.directMemberUids ?? descData.memberUids ?? [];
        if (!directMembers.includes(callerUid)) {
          await db.collection('boards').doc(descId).update({
            memberUids: admin.firestore.FieldValue.arrayRemove(callerUid),
          });
        }
      })
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`leaveBoard: failed to cascade removal to descendant ${descendantIds[i]}:`, r.reason);
      }
    });
  }

  return { success: true };
});

/**
 * deleteBoard
 *
 * Callable function that allows the board owner to fully delete a board.
 * Deletes all documents in every known subcollection (invites, transactions)
 * and then deletes the board document itself.  The caller must be
 * authenticated and must be the board owner.
 *
 * Firestore does NOT automatically delete subcollections when a document is
 * deleted.  All subcollections must be cleared explicitly before the board
 * document is removed to avoid orphaned data.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId - ID of the board document
 */
exports.deleteBoard = onCall(async (request) => {
  // 1. Require authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי למחוק לוח');
  }

  const callerUid = request.auth.uid;

  const { boardId } = request.data || {};
  if (!boardId) {
    throw new HttpsError('invalid-argument', 'boardId נדרש');
  }

  const boardRef = db.collection('boards').doc(boardId);

  // 2. Load the board document
  const boardSnap = await boardRef.get();
  if (!boardSnap.exists) {
    throw new HttpsError('not-found', 'הלוח לא נמצא');
  }

  const board = boardSnap.data();

  // 3. Verify caller is the board owner
  if (board.ownerUid !== callerUid) {
    throw new HttpsError('permission-denied', 'רק בעל הלוח יכול למחוק אותו');
  }

  // 4. Delete all invite documents in the invites subcollection
  const invitesSnap = await boardRef.collection('invites').get();
  const deleteInvites = invitesSnap.docs.map((d) => d.ref.delete());
  await Promise.all(deleteInvites);

  // 5. Delete all transaction documents in the transactions subcollection
  const transactionsSnap = await boardRef.collection('transactions').get();
  const deleteTransactions = transactionsSnap.docs.map((d) => d.ref.delete());
  await Promise.all(deleteTransactions);

  // 6. Delete the board document itself
  await boardRef.delete();

  return { success: true };
});
