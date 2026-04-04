/**
 * Membership cascade helpers for nested boards.
 */

/**
 * Backward-compatible direct members lookup.
 *
 * @param {object} board
 * @returns {string[]}
 */
function getDirectMemberUids(board) {
  if (Array.isArray(board?.directMemberUids)) return board.directMemberUids;
  if (Array.isArray(board?.memberUids)) return board.memberUids;
  return [];
}

/**
 * Computes effective-membership expectations for a subtree after removing a
 * user's direct membership from the root board.
 *
 * @param {object} params
 * @param {Record<string, object>} params.nodesById
 * @param {string} params.rootBoardId
 * @param {string} params.uid
 * @param {boolean} params.rootInheritedAccess
 * @returns {Array<{id: string, shouldHaveEffective: boolean, currentlyHasEffective: boolean}>}
 */
function buildEffectiveMembershipPlan({nodesById, rootBoardId, uid, rootInheritedAccess}) {
  const plan = [];

  function visit(boardId, inheritedFromParent) {
    const board = nodesById[boardId];
    if (!board) return;

    const directMembers = getDirectMemberUids(board);
    const hasDirect = boardId === rootBoardId ? false : directMembers.includes(uid);
    const shouldHaveEffective = hasDirect || inheritedFromParent;
    const currentlyHasEffective = (board.memberUids || []).includes(uid);

    plan.push({
      id: boardId,
      shouldHaveEffective,
      currentlyHasEffective,
    });

    const subBoardIds = Array.isArray(board.subBoardIds) ? board.subBoardIds : [];
    for (const subBoardId of subBoardIds) {
      if (nodesById[subBoardId]) {
        visit(subBoardId, shouldHaveEffective);
      }
    }
  }

  visit(rootBoardId, rootInheritedAccess);
  return plan;
}

module.exports = {
  getDirectMemberUids,
  buildEffectiveMembershipPlan,
};
