/**
 * Custom hook for real-time transaction subscription.
 */
import { useState, useEffect, useMemo } from 'react';
import { subscribeToTransactions } from '../firebase/transactions';

export function useTransactions(boardId) {
  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!boardId) return;
    const unsub = subscribeToTransactions(
      boardId,
      (data) => {
        setTransactions(data);
        setLoaded(true);
      },
      (err) => {
        setError(err.message);
        setLoaded(true);
      }
    );
    return unsub;
  }, [boardId]);

  /**
   * Memoized totals: per-card and grand total.
   * { perCard: { [cardLast4]: number }, grandTotal: number }
   */
  const totals = useMemo(() => {
    const perCard = {};
    let grandTotal = 0;
    for (const tx of transactions) {
      const amt = Number(tx.amount) || 0;
      perCard[tx.cardLast4] = (perCard[tx.cardLast4] || 0) + amt;
      grandTotal += amt;
    }
    return { perCard, grandTotal };
  }, [transactions]);

  return { transactions, loading: !!boardId && !loaded, error, totals };
}
