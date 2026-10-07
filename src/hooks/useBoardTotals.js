import { useState, useEffect } from 'react';
import { getHierarchySummary, subscribeToBoard } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

/** Exact subtree summaries. Descendant changes refresh on focus and every 30s,
 * matching the root catalog; current-board changes also refresh in real time. */
export function useBoardTotals(boardIds) {
  const { user } = useAuth();
  const uid = user?.uid;
  const idsKey = JSON.stringify(boardIds);
  const key = JSON.stringify([uid, idsKey]);
  const [state, setState] = useState({ key: '', entries: {} });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const versions = {};
    const ids = JSON.parse(idsKey);
    const publish = (id, update) => {
      if (cancelled) return;
      setState(prev => {
        const entries = prev.key === key ? prev.entries : {};
        return {key, entries: {...entries, [id]: {...entries[id], ...update}}};
      });
    };
    async function refresh(id, invalidate = false) {
      if (cancelled) return;
      const version = (versions[id] ?? 0) + 1;
      versions[id] = version;
      publish(id, {loading: true, error: null, ...(invalidate ? {summary: undefined} : {})});
      try {
        const summary = await getHierarchySummary(id);
        if (!cancelled && versions[id] === version) publish(id, {summary, loading: false});
      } catch (error) {
        if (!cancelled && versions[id] === version) publish(id, {summary: undefined, loading: false, error: error.message});
      }
    }
    const unsubscribes = ids.map(id => subscribeToBoard(id, board => {
      if (board?.memberUids?.includes(uid) && !board.deleting) {
        refresh(id, true);
      } else {
        versions[id] = (versions[id] ?? 0) + 1;
        publish(id, {summary: undefined, loading: false, error: 'הלוח אינו זמין'});
      }
    }, error => {
      versions[id] = (versions[id] ?? 0) + 1;
      publish(id, {summary: undefined, loading: false, error: error.message});
    }));
    const refreshAll = () => ids.forEach(id => refresh(id));
    const timer = window.setInterval(refreshAll, 30000);
    window.addEventListener('focus', refreshAll);
    window.addEventListener('boards-changed', refreshAll);
    return () => {
      cancelled = true;
      unsubscribes.forEach(unsubscribe => unsubscribe());
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshAll);
      window.removeEventListener('boards-changed', refreshAll);
    };
  }, [uid, idsKey, key, refreshIndex]);

  const entries = state.key === key ? state.entries : {};
  return {
    entries,
    totals: Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.summary?.totals])),
    refresh: () => setRefreshIndex(index => index + 1),
  };
}
