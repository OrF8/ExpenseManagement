/**
 * Firebase Cloud Functions for Expense Management.
 *
 * Callable functions:
 *   - acceptBoardInvite  : atomically adds the caller to board memberUids and marks invite accepted
 *   - declineBoardInvite : marks the invite as declined
 *
 * Both functions run with the Firebase Admin SDK and therefore bypass Firestore
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
