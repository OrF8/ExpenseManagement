/**
 * Utility functions for board hierarchy operations.
 *
 * Board hierarchy shape (fields added to each board document):
 *   parentBoardId : string | null   – ID of the super board, or null for top-level
 *   subBoardIds   : string[]        – ordered list of direct child board IDs
 */

/**
 * Collect all descendant board IDs of a given board (depth-first).
 * The visited Set prevents infinite loops if a cycle exists in the data.
 *
 * @param {string}   boardId
 * @param {Array}    allBoards  – flat array of board objects
 * @param {Set}      [visited]  – internal, do not pass
 * @returns {string[]}
 */
export function getDescendantIds(boardId, allBoards, visited = new Set()) {
  if (visited.has(boardId)) return [];
  visited.add(boardId);

  const board = allBoards.find((b) => b.id === boardId);
  const subIds = board?.subBoardIds ?? [];
  const result = [];

  for (const subId of subIds) {
    result.push(subId);
    result.push(...getDescendantIds(subId, allBoards, visited));
  }
  return result;
}

/**
 * Return true when making childId a sub-board of parentId is allowed.
 *
 * One-level hierarchy rules (depth > 1 is not allowed):
 *   • childId and parentId must be different boards
 *   • child must NOT already have a parent (cannot nest a sub-board further)
 *   • child must NOT already have sub-boards (cannot nest a super board)
 *   • parent must NOT already have a parent (cannot attach under a sub-board)
 *   • child is not already a direct sub-board of parent (no duplicates)
 *
 * @param {string} childId   – board to be nested (the "dragged" board)
 * @param {string} parentId  – board to nest under (the "target" board)
 * @param {Array}  allBoards
 * @returns {boolean}
 */
export function isMergeValid(childId, parentId, allBoards) {
  if (childId === parentId) return false;

  const child = allBoards.find((b) => b.id === childId);
  const parent = allBoards.find((b) => b.id === parentId);

  // One-level: child cannot already be a sub-board (has a parent)
  if (child?.parentBoardId) return false;

  // One-level: child cannot already be a super board (has children)
  if ((child?.subBoardIds?.length ?? 0) > 0) return false;

  // One-level: parent cannot already be a sub-board (cannot nest under a sub-board)
  if (parent?.parentBoardId) return false;

  // No duplicates: child is not already a direct sub-board of parent
  if (parent?.subBoardIds?.includes(childId)) return false;

  return true;
}

/**
 * Recursively compute the aggregate total expenses for a board.
 *   • Regular board (no subBoardIds): returns its own total from totalsMap.
 *   • Super board: returns the sum of its children's aggregate totals.
 *
 * The visited Set prevents double-counting if a cycle exists.
 *
 * @param {string}                boardId
 * @param {Object<string,number>} totalsMap  – { [boardId]: number }
 * @param {Array}                 allBoards
 * @param {Set}                   [visited]  – internal, do not pass
 * @returns {number}
 */
export function getAggregateTotalForBoard(boardId, totalsMap, allBoards, visited = new Set()) {
  if (visited.has(boardId)) return 0;
  visited.add(boardId);

  const board = allBoards.find((b) => b.id === boardId);
  const subIds = board?.subBoardIds ?? [];

  if (subIds.length === 0) {
    return totalsMap[boardId] ?? 0;
  }

  return subIds.reduce(
    (sum, subId) => sum + getAggregateTotalForBoard(subId, totalsMap, allBoards, visited),
    0,
  );
}
