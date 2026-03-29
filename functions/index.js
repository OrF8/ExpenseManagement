/**
 * Firebase Cloud Functions for Expense Management.
 *
 * Callable functions:
 *   - acceptBoardInvite  : atomically adds the caller to board memberUids and marks invite accepted
 *   - declineBoardInvite : marks the invite as declined
 *   - removeBoardMember  : allows the board owner to remove a non-owner member from the board
 *   - leaveBoard         : allows a non-owner member to remove themselves from a board
 *   - deleteBoard        : allows the board owner to fully delete a board and all its subcollections (invites, transactions)
 *
 * All functions run with the Firebase Admin SDK and therefore bypass Firestore
 * security rules.  All authorization checks are enforced in the function body.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

/**
 * acceptBoardInvite
 *
 * Callable function that allows an authenticated user to accept a board invite
 * addressed to their email.  The operation is performed inside a Firestore
 * transaction so that the invite status update and the memberUids array-union
 * are always atomic.
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
      tx.update(boardRef, {
        memberUids: admin.firestore.FieldValue.arrayUnion(uid),
      });
    }
  });

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

  // 6. Remove the member from memberUids
  await boardRef.update({
    memberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
  });

  return { success: true };
});

/**
 * leaveBoard
 *
 * Callable function that allows a non-owner member to remove themselves from a
 * board.  The caller must be authenticated, must be a member of the board, and
 * must not be the board owner.
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

  // 5. Remove the caller from memberUids
  await boardRef.update({
    memberUids: admin.firestore.FieldValue.arrayRemove(callerUid),
  });

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
