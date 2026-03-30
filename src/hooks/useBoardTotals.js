/**
 * Hook that one-shot fetches the grand-total of expenses for each board ID
 * in the provided array.  Re-fetches whenever the set of IDs changes.
 *
 * Returns:
 *   totals  – { [boardId]: number }   (starts as {}, fills in as fetches resolve)
 */
import { useState, useEffect } from 'react';
import { getBoardTotal } from '../firebase/transactions';

export function useBoardTotals(boardIds) {
  const [totals, setTotals] = useState({});

  // Serialize the IDs so the effect dependency is a stable primitive.
  const idsKey = boardIds.join(',');

  useEffect(() => {
    const ids = idsKey.split(',').filter(Boolean);
    if (ids.length === 0) return;

    let cancelled = false;

    Promise.all(ids.map((id) => getBoardTotal(id).then((total) => ({ id, total }))))
      .then((results) => {
        if (cancelled) return;
        const map = {};
        results.forEach(({ id, total }) => {
          map[id] = total;
        });
        setTotals(map);
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch board totals:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return { totals };
}
