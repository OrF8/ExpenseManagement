import { useState, useEffect } from 'react';
import { getBoardTotal } from '../firebase/transactions';
import { subscribeToBoard } from '../firebase/boards';

/** Refresh exact, currency-grouped totals whenever a board's money revision changes. */
export function useBoardTotals(boardIds) {
  const [state, setState] = useState({ key: '', totals: {} });
  const idsKey = boardIds.join(',');
  useEffect(() => {
    let cancelled = false;
    const versions = {};
    const publish = (id, total) => setState(prev => ({key: idsKey, totals: {...(prev.key === idsKey ? prev.totals : {}), [id]: total}}));
    const unsubscribes = idsKey.split(',').filter(Boolean).map(id => subscribeToBoard(id, async () => {
      const version = (versions[id] ?? 0) + 1; versions[id] = version;
      publish(id, undefined);
      try {
        const total = await getBoardTotal(id);
        if (!cancelled && versions[id] === version) publish(id, total);
      } catch (error) {
        if (!cancelled && versions[id] === version) publish(id, undefined);
        console.error('Failed to fetch board total:', error);
      }
    }, () => { if (!cancelled) publish(id, undefined); }));
    return () => { cancelled = true; unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [idsKey]);
  return { totals: state.key === idsKey ? state.totals : {} };
}
