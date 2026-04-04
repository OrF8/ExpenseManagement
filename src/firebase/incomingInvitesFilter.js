/**
 * Helpers for filtering incoming board invites shown to the signed-in user.
 */

/**
 * Checks whether an invite document is still pending.
 * Legacy invites without expiresAt are treated as active.
 * @param {{expiresAt?: {toMillis: function(): number}}} invite
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isInvitePending(invite, nowMs = Date.now()) {
  if (!invite?.expiresAt) return true;
  return invite.expiresAt.toMillis() > nowMs;
}

/**
 * Checks whether uid is a direct member of the board.
 * Legacy boards without directMemberUids treat memberUids as direct.
 * @param {{directMemberUids?: string[], memberUids?: string[]}|null|undefined} board
 * @param {string|undefined|null} uid
 * @returns {boolean}
 */
export function isDirectMember(board, uid) {
  if (!uid || !board) return false;
  const directMemberUids = Array.isArray(board.directMemberUids)
    ? board.directMemberUids
    : Array.isArray(board.memberUids)
      ? board.memberUids
      : [];
  return directMemberUids.includes(uid);
}

/**
 * Returns visible, actionable pending invites for the signed-in user.
 *
 * Rules:
 * - Invite document must still be pending.
 * - Invite's board must exist.
 * - Invite is hidden only when caller is already a direct member of that board.
 *   Inherited-only membership must not hide the invite.
 *
 * @param {{
 *  invites: Array<object>,
 *  boardsById: Record<string, object>,
 *  currentUid?: string,
 *  nowMs?: number,
 * }} params
 * @returns {Array<object>}
 */
export function getVisibleIncomingInvites({ invites, boardsById, currentUid, nowMs = Date.now() }) {
  return invites
    .filter((invite) => isInvitePending(invite, nowMs))
    .filter((invite) => {
      const boardId = invite?.boardId;
      if (!boardId || !boardsById[boardId]) return false;
      return !isDirectMember(boardsById[boardId], currentUid);
    })
    .sort((a, b) => {
      const aMs = a.createdAt?.toMillis?.() ?? 0;
      const bMs = b.createdAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    });
}
