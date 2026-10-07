/**
 * Firebase Cloud Functions for Expense Management.
 *
 * Callable functions:
 *   - createBoardInvite    : allows the board owner to create an email-based invite without client-side reads
 *                            from /users; prevents duplicate active invites
 *   - getBoardCollaboratorProfiles : allows board members to fetch minimal display-safe profiles (uid + nickname)
 *                                    for other members of the board without broad client reads from /users
 *   - acceptBoardInvite  : atomically adds the caller to board memberUids/directMemberUids and deletes the invite;
 *                          also cascades memberUids addition to all descendant boards (inherited access)
 *   - declineBoardInvite : validates ownership and deletes the invite
 *   - removeBoardMember  : allows the board owner to remove a non-owner member from the board;
 *                          cascades removal from descendants unless user has direct access there
 *   - leaveBoard         : allows a non-owner member to remove themselves from a board;
 *                          cascades removal from descendants unless user has direct access there
 *   - deleteBoard        : allows the board owner to fully delete a board and all its subcollections (invites, transactions)
 *   - deleteMyAccount    : permanently deletes the authenticated user's account and all data they own, including:
 *                          - all boards where they are owner (ownerUid == callerUid), including every board in their
 *                            hierarchy (descendants with the same ownerUid)
 *                          - membership cleanup: the caller's UID is removed from memberUids and directMemberUids on
 *                            every board they do NOT own
 *                          - user profile document at users/{uid}
 *                          - Firebase Auth user record
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
const {
    isAlreadyDirectMember,
    hasActiveInvite,
} = require('./inviteMembership');

admin.initializeApp();

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * createBoardInvite
 *
 * Callable function that allows a board owner to invite a collaborator by email.
 * This runs server-side to avoid broad client reads from /users.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId
 * @param {string} request.data.invitedEmail
 */
exports.createBoardInvite = onCall(
    { enforceAppCheck: true },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לשלוח הזמנה');
        }

        const {boardId, invitedEmail} = request.data || {};
        if (!boardId || !invitedEmail) {
            throw new HttpsError('invalid-argument', 'boardId ו-invitedEmail נדרשים');
        }

        const normalizedEmail = String(invitedEmail).trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            throw new HttpsError('invalid-argument', 'כתובת הדוא״ל שהוזנה אינה תקינה');
        }

        // Ensure invite target exists in users collection
        const userByEmailSnap = await db
            .collection('users')
            .where('emailLower', '==', normalizedEmail)
            .limit(1)
            .get();

        if (userByEmailSnap.empty) {
            throw new HttpsError('failed-precondition','לא נמצא משתמש רשום עם כתובת דוא״ל זו');
        }

        const callerEmail = (request.auth.token.email || '').trim().toLowerCase();

        if (normalizedEmail === callerEmail) {
            throw new HttpsError('failed-precondition', 'לא ניתן להזמין את עצמך ללוח');
        }

        const callerUid = request.auth.uid;
        const boardRef = db.collection('boards').doc(boardId);
        const invitesRef = boardRef.collection('invites');
        const targetUid = userByEmailSnap.docs[0].id;

        const result = await db.runTransaction(async (tx) => {
            const boardSnap = await tx.get(boardRef);
            if (!boardSnap.exists) {
                throw new HttpsError('not-found', 'הלוח לא נמצא');
            }

            const board = boardSnap.data();
            if (board.deleting) throw new HttpsError('failed-precondition', 'הלוח בתהליך מחיקה');
            if (board.ownerUid !== callerUid) {
                throw new HttpsError('permission-denied', 'רק בעל הלוח יכול להזמין משתתפים');
            }

            // Block only users who are already direct members of this board.
            // Users with inherited-only access can still be invited/promoted.
            if (isAlreadyDirectMember(board, targetUid)) {
                throw new HttpsError('failed-precondition', 'המשתמש כבר חבר בלוח');
            }

            const existingSnap = await tx.get(
                invitesRef.where('invitedEmailLower', '==', normalizedEmail).limit(20),
            );
            const now = Date.now();
            const hasActiveInviteForUser = hasActiveInvite(
                existingSnap.docs.map((docSnap) => docSnap.data()),
                now,
            );

            if (hasActiveInviteForUser) {
                throw new HttpsError('already-exists', 'כבר קיימת הזמנה פתוחה למשתמש זה');
            }

            const createdAt = admin.firestore.Timestamp.now();
            const expiresAt = admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
            const inviteRef = invitesRef.doc();
            tx.set(inviteRef, {
                boardId,
                boardTitle: board.title || '',
                invitedByUid: callerUid,
                invitedByEmail: request.auth.token.email || null,
                invitedEmail: normalizedEmail,
                invitedEmailLower: normalizedEmail,
                createdAt,
                expiresAt,
            });

            return {inviteId: inviteRef.id};
        });

        return {success: true, ...result};
    },
);

/**
 * getBoardCollaboratorProfiles
 *
 * Callable function that returns minimal display-safe collaborator profiles
 * (uid + nickname) for a board's members. The client never reads other users'
 * /users docs directly.
 *
 * Authorization:
 *   - caller must be authenticated
 *   - caller must already be a member of the target board
 *
 * Data minimization:
 *   - returns only: { uid, nickname, email }
 *
 * @param {object} request.data
 * @param {string} request.data.boardId
 * @param {string[]=} request.data.uids
 */
exports.getBoardCollaboratorProfiles = onCall(
    {enforceAppCheck: true},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר');
      }

      const {boardId, uids} = request.data || {};
      if (!boardId) {
        throw new HttpsError('invalid-argument', 'boardId נדרש');
      }

      const callerUid = request.auth.uid;
      const boardSnap = await db.collection('boards').doc(boardId).get();
      if (!boardSnap.exists) {
        throw new HttpsError('not-found', 'הלוח לא נמצא');
      }

      const board = boardSnap.data() || {};
      const boardMemberUids = Array.isArray(board.memberUids) ? board.memberUids : [];
      if (!boardMemberUids.includes(callerUid)) {
        throw new HttpsError('permission-denied', 'אין לך הרשאה לצפות בחברי הלוח');
      }

      const requestedUids = Array.isArray(uids) ? uids.filter((uid) => typeof uid === 'string') : boardMemberUids;
      const targetUids = [...new Set(requestedUids.filter((uid) => boardMemberUids.includes(uid)))];

      if (targetUids.length === 0) {
        return {profiles: []};
      }

      const userRefs = targetUids.map((uid) => db.collection('users').doc(uid));
      const userSnaps = await db.getAll(...userRefs);

      const profiles = userSnaps.map((snap, i) => {
        if (!snap.exists) {
          return {uid: targetUids[i], nickname: 'משתמש', email: ''};
        }
        const data = snap.data() || {};
        const nickname = typeof data.nickname === 'string' && data.nickname.trim()
          ? data.nickname.trim()
          : 'משתמש';
        const email = typeof data.email === 'string' ? data.email : '';
        return {uid: snap.id, nickname, email};
      });

      return {profiles};
    },
);

/**
 * declineBoardInvite
 *
 * Callable function that allows an authenticated user to decline a board invite
 * addressed to their email.  Declines are handled by deleting the invitation
 * document so no rejected marker is left in Firestore.
 *
 * @param {object} request.data
 * @param {string} request.data.boardId  - ID of the board document
 * @param {string} request.data.inviteId - ID of the invite document
 */
exports.declineBoardInvite = onCall(
    { enforceAppCheck: true },
    async (request) => {
      // 1. Require authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לדחות הזמנה');
      }

      const callerEmail = (request.auth.token.email || '').toLowerCase();

      const {boardId, inviteId} = request.data || {};
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

      // 3. Verify invite has not expired.
      // Legacy documents without expiresAt are treated as active for backward compatibility.
      if (invite.expiresAt && invite.expiresAt.toMillis() <= Date.now()) {
        throw new HttpsError('failed-precondition', 'פג תוקף ההזמנה');
      }

      // 4. Verify caller email matches the invite
      if ((invite.invitedEmailLower || '') !== callerEmail) {
        throw new HttpsError('permission-denied', 'אין לך הרשאה לדחות הזמנה זו');
      }

      // 5. Delete the invite document — no declined marker is kept
      await inviteRef.delete();

      return {success: true};
    }
);

// Currency-sensitive writes are centralized and protected by App Check and auth.
const {createMoneyOperations, MoneyError} = require('./moneyOperations.mjs');
const {createHierarchyOperations} = require('./hierarchyOperations.mjs');
const hierarchyOperations = createHierarchyOperations({db, timestamp: () => admin.firestore.FieldValue.serverTimestamp()});
for (const operation of ['createBoard', 'reparentBoard', 'deleteBoard', 'getHierarchySummary', 'listBoardRoots', 'acceptBoardInvite', 'removeBoardMember', 'leaveBoard']) {
  exports[operation] = onCall({enforceAppCheck: true}, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'עליך להתחבר');
    try {
      const mode = {acceptBoardInvite: 'accept', removeBoardMember: 'remove', leaveBoard: 'leave'}[operation];
      if (mode) return await hierarchyOperations.changeMembership(request.auth.uid, request.data || {}, mode, (request.auth.token.email || '').toLowerCase());
      return await hierarchyOperations[operation](request.auth.uid, request.data || {});
    } catch (error) {
      if (error instanceof MoneyError) throw new HttpsError(error.code, error.message);
      console.error('Hierarchy operation failed:', error);
      throw new HttpsError('internal', 'הפעולה נכשלה. יש לרענן ולנסות שוב.');
    }
  });
}
const moneyOperations = createMoneyOperations({db, timestamp: () => admin.firestore.FieldValue.serverTimestamp()});
for (const operation of ['saveTransaction', 'deleteTransaction', 'changeBoardCurrency', 'moveTransaction', 'duplicateTransaction']) {
  exports[operation] = onCall({enforceAppCheck: true}, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'עליך להתחבר');
    try {
      if (operation === 'moveTransaction' || operation === 'duplicateTransaction') {
        return await moneyOperations.transfer(request.auth.uid, request.data || {}, operation === 'duplicateTransaction');
      }
      return await moneyOperations[operation](request.auth.uid, request.data || {});
    } catch (error) {
      if (error instanceof MoneyError) throw new HttpsError(error.code, error.message);
      if (error instanceof HttpsError) throw error;
      if (error.code) { console.error('Monetary operation failed:', error); throw new HttpsError('internal', 'שמירת הנתונים נכשלה. נסו שוב.'); }
      throw new HttpsError('invalid-argument', error.message || 'Invalid monetary data');
    }
  });
}

// Shared board-deletion helper
// ---------------------------------------------------------------------------

/**
 * Delete a single board document and all its known subcollections
 * (invites, transactions).  Does NOT check ownership — callers are
 * responsible for authorisation before invoking this helper.
 *
 * Firestore does NOT automatically delete subcollections when a parent
 * document is deleted.  All subcollections must be cleared explicitly to
 * avoid orphaned data.
 *
 * @param {string} boardId
 * @returns {Promise<void>}
 */
async function deleteBoardData(boardId) {
  const boardRef = db.collection('boards').doc(boardId);

  // Delete all invite documents in the invites subcollection
  const invitesSnap = await boardRef.collection('invites').get();
  await Promise.all(invitesSnap.docs.map((d) => d.ref.delete()));

  // Delete all transaction documents in the transactions subcollection
  const transactionsSnap = await boardRef.collection('transactions').get();
  await Promise.all(transactionsSnap.docs.map((d) => d.ref.delete()));

  // Delete the board document itself
  await boardRef.delete();
}

/**
 * deleteMyAccount
 *
 * Callable function that permanently deletes the authenticated user's account
 * and all data they own.  The user identity is derived from the authenticated
 * request — the client never provides a UID.
 *
 * ## Deletion order
 *
 * 1. All boards owned by the caller (ownerUid == callerUid), including every
 *    board in their hierarchy (descendants with the same ownerUid).
 *    For each board: invites subcollection → transactions subcollection →
 *    board document.
 *
 *    Ownership invariant: all boards in a hierarchy share the same ownerUid.
 *    Authoritative hierarchy operations enforce common ownership. Therefore,
 *    querying ownerUid == callerUid already captures all boards in every
 *    hierarchy the user created, without needing to traverse parents.
 *
 * 2. Membership cleanup: the caller's UID is removed from memberUids and
 *    directMemberUids on every board they do NOT own (i.e. boards where they
 *    are a collaborator).  This prevents orphaned UID references.
 *
 * 3. User profile document at users/{uid}.
 *
 * 4. Firebase Auth user record (must be last so the function runs with a
 *    valid auth context throughout).
 */
exports.deleteMyAccount = onCall(
    { enforceAppCheck: true },
    async (request) => {
      // 1. Require authentication — UID comes from the verified token, never from the client
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי למחוק את החשבון');
      }

      const uid = request.auth.uid;
      console.log(`deleteMyAccount: starting deletion for uid=${uid}`);

      await db.runTransaction(async tx => {
        const lockRef = db.collection('hierarchyLocks').doc(uid);
        await tx.get(lockRef);
        tx.set(lockRef, {deletingAccount: true});
      });

      // 2. Find all boards owned by the user
      const ownedBoardsSnap = await db.collection('boards')
          .where('ownerUid', '==', uid)
          .get();

      console.log(`deleteMyAccount: found ${ownedBoardsSnap.size} owned board(s)`);

      // 3. Collect all board IDs to delete (owned boards + all their descendants).
      //    A Set is used to deduplicate in case a board appears in multiple traversals.
      const boardIdsToDelete = new Set();
      for (const boardDoc of ownedBoardsSnap.docs) {
        boardIdsToDelete.add(boardDoc.id);

      }

      console.log(`deleteMyAccount: will delete ${boardIdsToDelete.size} board(s) in total (including descendants)`);

      // 4. Delete each board and its subcollections (invites, transactions).
      //    Use Promise.all (not allSettled) so that any board deletion failure throws
      //    immediately and prevents the account from being finalized as deleted while
      //    data still exists.  The product rule is: everything owned by the user must
      //    be removed; partial cleanup is not acceptable.
      const boardIdsArray = [...boardIdsToDelete];
      try {
        await Promise.all(ownedBoardsSnap.docs.map(d => d.ref.update({deleting: true})));
        await Promise.all(boardIdsArray.map((boardId) => deleteBoardData(boardId)));
      } catch (err) {
        console.error('deleteMyAccount: failed to delete owned board data, aborting account deletion:', err);
        throw new HttpsError(
            'internal',
            'שגיאה במחיקת נתוני הלוחות. החשבון לא נמחק. נסה שוב.',
        );
      }

      // 5. Remove the user from memberUids/directMemberUids on boards they do NOT own
      //    (boards where the user is a collaborator).  This prevents orphaned UID
      //    references on other users' boards.  Failures here are also treated as fatal:
      //    leaving stale UID references behind could cause permission and display bugs
      //    for other board members.
      const memberBoardsSnap = await db.collection('boards')
          .where('memberUids', 'array-contains', uid)
          .get();

      const nonOwnedBoards = memberBoardsSnap.docs.filter((d) => {
        const data = d.data();
        return data.ownerUid !== uid; // skip owned boards (already deleted above)
      });

      try {
        for (const ownerUid of new Set(nonOwnedBoards.map(d => d.data().ownerUid))) {
          await db.runTransaction(async tx => {
            const lockRef = db.collection('hierarchyLocks').doc(ownerUid);
            const lockSnap = await tx.get(lockRef);
            const snap = await tx.get(db.collection('boards').where('ownerUid', '==', ownerUid));
            const affected = snap.docs.filter(d => d.data().memberUids?.includes(uid) || d.data().directMemberUids?.includes(uid));
            if (affected.length > 450) throw new HttpsError('resource-exhausted', 'נדרש ניקוי שיתוף לפני מחיקת החשבון');
            for (const d of affected) tx.update(d.ref, {
              memberUids: admin.firestore.FieldValue.arrayRemove(uid),
              directMemberUids: (d.data().directMemberUids ?? d.data().memberUids ?? []).filter(member => member !== uid),
            });
            tx.set(lockRef, {...lockSnap.data(), revision:(lockSnap.data()?.revision ?? 0)+1});
          });
        }
      } catch (err) {
        console.error('deleteMyAccount: failed to clean up board membership, aborting account deletion:', err);
        throw new HttpsError(
            'internal',
            'שגיאה בניקוי חברות בלוחות. החשבון לא נמחק. נסה שוב.',
        );
      }

      // 6. Delete the user's Firestore profile document (users/{uid})
      await db.collection('users').doc(uid).delete();
      console.log(`deleteMyAccount: deleted Firestore profile for uid=${uid}`);

      // 7. Delete the Firebase Auth user — must be last so the function
      //    can run with a valid auth context throughout all preceding steps.
      await admin.auth().deleteUser(uid);
      console.log(`deleteMyAccount: deleted Auth user uid=${uid}`);

      return {success: true};
    }
);
