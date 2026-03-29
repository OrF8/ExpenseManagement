/**
 * Custom hook for real-time transaction subscription.
 * State tracks the boardId it was loaded for, so stale data from a previous
 * board is never shown and loading is correct when navigating between boards.
 */
import { useState, useEffect, useMemo } from 'react';
import { subscribeToTransactions } from '../firebase/transactions';

export function useTransactions(boardId) {
  // forBoardId tracks which board's data is currently in state
  const [state, setState] = useState({ transactions: [], error: null, forBoardId: null });

  useEffect(() => {
    if (!boardId) return;
    const unsub = subscribeToTransactions(
      boardId,
      (data) => setState({ transactions: data, error: null, forBoardId: boardId }),
      (err) => setState({ transactions: [], error: err.message, forBoardId: boardId })
    );
    return unsub;
  }, [boardId]);

  const loading = !!boardId && state.forBoardId !== boardId;
  const isFresh = state.forBoardId === boardId;

  /**
   * Memoized totals: per-card and grand total.
   * { perCard: { [cardLast4]: number }, grandTotal: number }
   */
  const totals = useMemo(() => {
    const source = isFresh ? state.transactions : [];
    const perCard = {};
    let grandTotal = 0;
    for (const tx of source) {
      const amt = Number(tx.amount) || 0;
      perCard[tx.cardLast4] = (perCard[tx.cardLast4] || 0) + amt;
      grandTotal += amt;
    }
    return { perCard, grandTotal };
  }, [isFresh, state.transactions]);

  const transactions = isFresh ? state.transactions : [];
  const error = isFresh ? state.error : null;

  return { transactions, loading, error, totals };
}
