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
 *                            hierarchy (descendants reachable via subBoardIds)
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
    promoteToDirectMember,
} = require('./inviteMembership');
const {
  buildEffectiveMembershipPlan,
} = require('./membershipCascade');

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
 * Traverse the subtree rooted at boardId and return a map of boardId → board
 * data for every descendant (excluding the root itself).  Each board document
 * is fetched exactly once.  Cycle-safe via a visited Set.
 *
 * @param {string} boardId
 * @returns {Promise<Record<string, object>>}
 */
async function getDescendantBoardsData(boardId) {
  const visited = new Set();
  const result = {};

  async function traverse(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const snap = await db.collection('boards').doc(id).get();
    if (!snap.exists) return;
    const data = snap.data();
    if (id !== boardId) {
      result[id] = data;
    }
    const subIds = data.subBoardIds || [];
    for (const subId of subIds) {
      await traverse(subId);
    }
  }

  await traverse(boardId);
  return result;
}

/**
 * Returns true when the user still has effective membership on any ancestor of
 * the provided board. Effective membership is read from ancestor memberUids.
 *
 * @param {string|null|undefined} parentBoardId
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
async function hasAncestorEffectiveAccess(parentBoardId, uid) {
  let currentParentId = parentBoardId || null;
  while (currentParentId) {
    const parentSnap = await db.collection('boards').doc(currentParentId).get();
    if (!parentSnap.exists) break;
    const parentData = parentSnap.data();
    const parentMembers = parentData.memberUids || [];
    if (parentMembers.includes(uid)) {
      return true;
    }
    currentParentId = parentData.parentBoardId || null;
  }
  return false;
}

/**
 * Recomputes effective memberUids for a board subtree after direct removal on
 * the root board, preserving inherited access from remaining ancestor paths.
 *
 * @param {string} rootBoardId
 * @param {string} uid
 * @param {object} rootBoard
 * @returns {Promise<void>}
 */
async function recalculateEffectiveMembershipAfterDirectRemoval(rootBoardId, uid, rootBoard) {
  const descendantData = await getDescendantBoardsData(rootBoardId);
  const nodesById = {[rootBoardId]: rootBoard, ...descendantData};

  const rootInheritedAccess = await hasAncestorEffectiveAccess(rootBoard.parentBoardId, uid);
  const plan = buildEffectiveMembershipPlan({
    nodesById,
    rootBoardId,
    uid,
    rootInheritedAccess,
  });

  const updates = plan
      .filter((item) => item.shouldHaveEffective !== item.currentlyHasEffective)
      .map((item) => db.collection('boards').doc(item.id).update({
        memberUids: item.shouldHaveEffective ?
          admin.firestore.FieldValue.arrayUnion(uid) :
          admin.firestore.FieldValue.arrayRemove(uid),
      }));

  if (updates.length > 0) {
    const results = await Promise.allSettled(updates);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(
            `recalculateEffectiveMembershipAfterDirectRemoval: failed update ${i} for ${rootBoardId}:`,
            r.reason,
        );
      }
    });
  }
}

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
 * acceptBoardInvite
 *
 * Callable function that allows an authenticated user to accept a board invite
 * addressed to their email.  The operation is performed inside a Firestore
 * transaction so that the invite deletion and the memberUids array-union
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
exports.acceptBoardInvite = onCall(
    { enforceAppCheck: true },
    async (request) => {
      // 1. Require authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לקבל הזמנה');
      }

      const uid = request.auth.uid;
      const callerEmail = (request.auth.token.email || '').toLowerCase();

      const {boardId, inviteId} = request.data || {};
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

        // 3. Verify invite has not expired.
        // Legacy documents without expiresAt are treated as active for backward compatibility.
        if (invite.expiresAt && invite.expiresAt.toMillis() <= Date.now()) {
          throw new HttpsError('failed-precondition', 'פג תוקף ההזמנה');
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

        // 6. Atomically delete the invite document and add UID to board (no duplication)
        tx.delete(inviteRef);

        if (Array.isArray(board.directMemberUids)) {
            // Modern schema: idempotently promote/keep direct membership.
            tx.update(boardRef, {
                memberUids: admin.firestore.FieldValue.arrayUnion(uid),
                directMemberUids: admin.firestore.FieldValue.arrayUnion(uid),
            });
        } else {
            // Legacy schema: directMemberUids missing means all memberUids are direct.
            // Initialize directMemberUids from current members to preserve legacy semantics.
            const promoted = promoteToDirectMember(board, uid);
            tx.update(boardRef, promoted);
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

      return {success: true};
    }
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
exports.removeBoardMember = onCall(
    { enforceAppCheck: true },
    async (request) => {
      // 1. Require authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי להסיר חבר');
      }

      const callerUid = request.auth.uid;

      const {boardId, memberUid} = request.data || {};
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

      // 6. Always remove direct membership from this board.
      await boardRef.update({
        directMemberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
      });
      // 7. Recompute effective membership on this board and descendants.
      await recalculateEffectiveMembershipAfterDirectRemoval(boardId, memberUid, board);

      return {success: true};
    }
);

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
exports.leaveBoard = onCall(
    { enforceAppCheck: true },
    async (request) => {
      // 1. Require authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי לעזוב לוח');
      }

      const callerUid = request.auth.uid;

      const {boardId} = request.data || {};
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

      // 5. Always remove direct membership from this board.
      await boardRef.update({
        directMemberUids: admin.firestore.FieldValue.arrayRemove(callerUid),
      });
      // 6. Recompute effective membership on this board and descendants.
      await recalculateEffectiveMembershipAfterDirectRemoval(boardId, callerUid, board);

      return {success: true};
    }
);

// ---------------------------------------------------------------------------
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
exports.deleteBoard = onCall(
    { enforceAppCheck: true },
    async (request) => {
      // 1. Require authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'עליך להיות מחובר כדי למחוק לוח');
      }

      const callerUid = request.auth.uid;

      const {boardId} = request.data || {};
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

      // 4. Delegate to shared helper
      await deleteBoardData(boardId);

      return {success: true};
    }
);

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
 *    board in their hierarchy (descendants reachable via subBoardIds).
 *    For each board: invites subcollection → transactions subcollection →
 *    board document.
 *
 *    Ownership invariant: all boards in a hierarchy share the same ownerUid.
 *    The UI enforces this by requiring the caller to own both the dragged
 *    board and the drop target when merging into a super-board.  Therefore
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
        const descendantIds = await getDescendantBoardIds(boardDoc.id);
        descendantIds.forEach((id) => boardIdsToDelete.add(id));
      }

      console.log(`deleteMyAccount: will delete ${boardIdsToDelete.size} board(s) in total (including descendants)`);

      // 4. Delete each board and its subcollections (invites, transactions).
      //    Use Promise.all (not allSettled) so that any board deletion failure throws
      //    immediately and prevents the account from being finalized as deleted while
      //    data still exists.  The product rule is: everything owned by the user must
      //    be removed; partial cleanup is not acceptable.
      const boardIdsArray = [...boardIdsToDelete];
      try {
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
        await Promise.all(
            nonOwnedBoards.map((d) =>
                d.ref.update({
                  memberUids: admin.firestore.FieldValue.arrayRemove(uid),
                  directMemberUids: admin.firestore.FieldValue.arrayRemove(uid),
                })
            )
        );
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
