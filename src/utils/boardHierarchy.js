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
 * Return true when merging draggedId as a sub-board of targetId is allowed:
 *   • not the same board
 *   • dragged is not already a direct sub-board of target
 *   • target is not a descendant of dragged (no cycle)
 *
 * @param {string} draggedId
 * @param {string} targetId
 * @param {Array}  allBoards
 * @returns {boolean}
 */
export function isMergeValid(draggedId, targetId, allBoards) {
  if (draggedId === targetId) return false;

  const target = allBoards.find((b) => b.id === targetId);
  if (target?.subBoardIds?.includes(draggedId)) return false;

  const descendants = getDescendantIds(draggedId, allBoards);
  if (descendants.includes(targetId)) return false;

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
