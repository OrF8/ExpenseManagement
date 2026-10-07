/** parentBoardId is authoritative. Legacy missing parents are roots. */
export const parentOf = board => board?.parentBoardId ?? null;
export function indexHierarchy(boards) {
  const byId = new Map(boards.map(board => [board.id, board]));
  const children = new Map();
  for (const board of boards) {
    const parent = parentOf(board);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(board);
  }
  return { byId, children };
}
/** Never reveals missing/inaccessible ancestors; callers supply authorized boards only. */
export function ancestorPath(boardId, boards) {
  const { byId } = indexHierarchy(boards);
  const path = [], visited = new Set();
  let id = boardId, incomplete = false;
  while (id) {
    if (visited.has(id)) { incomplete = true; break; }
    visited.add(id);
    const board = byId.get(id);
    if (!board) { incomplete = true; break; }
    path.push(board);
    id = parentOf(board);
  }
  return { path: path.reverse(), incomplete };
}
export function subtreeBoards(boardId, boards) {
  const { byId, children } = indexHierarchy(boards);
  const result = [], queue = [boardId], visited = new Set();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (visited.has(id)) throw new Error('Invalid hierarchy cycle');
    visited.add(id);
    const board = byId.get(id);
    if (!board) continue;
    result.push(board);
    for (const child of children.get(id) ?? []) queue.push(child.id);
  }
  return result;
}
export function canReparent(childId, parentId, boards) {
  const { byId } = indexHierarchy(boards);
  const child = byId.get(childId);
  if (!child || childId === parentId) return false;
  if (parentId === null) return true;
  const { path, incomplete } = ancestorPath(parentId, boards);
  return !incomplete && path.length > 0 && path.every(b => b.id !== childId && b.ownerUid === child.ownerUid && !b.deleting);
}
export function boardPathLabel(boardId, boards) {
  const { path, incomplete } = ancestorPath(boardId, boards);
  return `${incomplete ? '… / ' : ''}${path.map(b => b.title).join(' / ')}`;
}
