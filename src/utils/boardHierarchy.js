import { mergeCurrencyTotals } from '../../functions/shared/money.mjs';
import { canReparent, subtreeBoards } from '../../functions/shared/hierarchy.mjs';
export { ancestorPath, boardPathLabel } from '../../functions/shared/hierarchy.mjs';
export const isMergeValid = (childId, parentId, boards) =>
  (boards.find(b => b.id === childId)?.parentBoardId ?? null) !== parentId && canReparent(childId, parentId, boards);
/** Includes direct transactions at every level; incomplete/corrupt totals stay unavailable. */
export function getAggregateTotalForBoard(boardId, totalsMap, allBoards) {
  try {
    const nodes = subtreeBoards(boardId, allBoards);
    return nodes.every(b => totalsMap[b.id]) ? mergeCurrencyTotals(nodes.map(b => totalsMap[b.id])) : undefined;
  } catch { return undefined; }
}
