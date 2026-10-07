import { useEffect, useState } from 'react';
import { subscribeToBoard, subscribeToChildBoards } from '../firebase/boards';
/** Only immediate children and the accessible ancestor chain are subscribed.
 * Each visited ancestor is observed so moves/renames rebuild the path safely. */
export function useBoardNavigation(board, uid) {
  const boardId = board?.id, parentId = board?.parentBoardId ?? null;
  const [childrenState, setChildren] = useState({});
  const [pathState, setPath] = useState({});
  useEffect(() => {
    if (!boardId || !uid) return;
    return subscribeToChildBoards(boardId, uid,
      children => setChildren({boardId, children}),
      error => setChildren({boardId, error: error.message}));
  }, [boardId, uid]);
  useEffect(() => {
    if (!boardId || !uid) return;
    let stopped = false;
    const entries = new Map(), subscriptions = new Map();
    function rebuild() {
      if (stopped) return;
      const visited = new Set([boardId]), path = [];
      let id = parentId, incomplete = false;
      while (id) {
        if (visited.has(id)) { incomplete = true; break; }
        visited.add(id);
        if (!entries.has(id)) {
          if (!subscriptions.has(id)) {
            subscriptions.set(id, subscribeToBoard(id, value => { entries.set(id, value); rebuild(); }, () => { entries.set(id, null); rebuild(); }));
          }
          return;
        }
        const b = entries.get(id);
        if (!b || !b.memberUids?.includes(uid) || b.ownerUid !== board.ownerUid) { incomplete = true; break; }
        path.push(b); id = b.parentBoardId ?? null;
      }
      setPath({boardId, parentId, path: path.reverse(), incomplete});
      for (const [key, unsubscribe] of subscriptions) if (!visited.has(key)) { unsubscribe(); subscriptions.delete(key); entries.delete(key); }
    }
    rebuild();
    return () => { stopped = true; subscriptions.forEach(fn => fn()); };
  }, [boardId, parentId, uid, board?.ownerUid]);
  const currentChildren = childrenState.boardId === boardId ? childrenState : {};
  const currentPath = pathState.boardId === boardId && pathState.parentId === parentId ? pathState : {};
  return {children: currentChildren.children ?? [], error: currentChildren.error, path: currentPath.path ?? [], incomplete: currentPath.incomplete,
    loading: !currentChildren.children && !currentChildren.error};
}
