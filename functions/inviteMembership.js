/**
 * Helpers for invite eligibility and membership promotion.
 *
 * Backward compatibility:
 * - If directMemberUids is missing, legacy boards treat memberUids as direct.
 */

/**
 * Returns direct member UIDs with legacy fallback.
 * @param {object} board
 * @returns {string[]}
 */
function getDirectMemberUids(board) {
  if (Array.isArray(board?.directMemberUids)) return board.directMemberUids;
  if (Array.isArray(board?.memberUids)) return board.memberUids;
  return [];
}

/**
 * Whether target UID should be blocked from receiving a new invite.
 * Users are blocked only if they are direct members of the board.
 * @param {object} board
 * @param {string} targetUid
 * @returns {boolean}
 */
function isAlreadyDirectMember(board, targetUid) {
  return getDirectMemberUids(board).includes(targetUid);
}

/**
 * Computes next membership arrays after invite acceptance.
 * Ensures the user is direct on the invited board and present in memberUids.
 * @param {object} board
 * @param {string} uid
 * @returns {{ memberUids: string[], directMemberUids: string[] }}
 */
function promoteToDirectMember(board, uid) {
  const memberUids = Array.isArray(board?.memberUids) ? board.memberUids : [];
  const directMemberUids = getDirectMemberUids(board);
  return {
    memberUids: Array.from(new Set([...memberUids, uid])),
    directMemberUids: Array.from(new Set([...directMemberUids, uid])),
  };
}

/**
 * Whether any existing invite documents are still active.
 * @param {Array<{expiresAt?: {toMillis: function(): number}}>} invites
 * @param {number} now
 * @returns {boolean}
 */
function hasActiveInvite(invites, now = Date.now()) {
  return invites.some((existing) => {
    if (!existing.expiresAt) return true; // legacy invite without expiry
    return existing.expiresAt.toMillis() > now;
  });
}

module.exports = {
  isAlreadyDirectMember,
  promoteToDirectMember,
  hasActiveInvite,
};