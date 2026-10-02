/**
 * Custom hook for real-time transaction subscription.
 * State tracks the boardId it was loaded for, so stale data from a previous
 * board is never shown and loading is correct when navigating between boards.
 */
import {useEffect, useMemo, useState} from 'react';
import {subscribeToTransactions} from '../firebase/transactions';

export function useTransactions(boardId) {
  // forBoardId tracks which board's data is currently in state
  const [state, setState] = useState({ transactions: [], error: null, forBoardId: null });

  useEffect(() => {
    if (!boardId) return;
    return subscribeToTransactions(
        boardId,
        (data) => setState({transactions: data, error: null, forBoardId: boardId}),
        (err) => setState({transactions: [], error: err.message, forBoardId: boardId})
    );
  }, [boardId]);

  const loading = !!boardId && state.forBoardId !== boardId;
  const isFresh = state.forBoardId === boardId;

  /**
   * Sort transactions: dated ones first (newest first by transactionDate),
   * then undated ones (preserving their relative Firestore order).
   * transactionDate is stored as YYYY-MM-DD so string comparison is correct.
   */
  const transactions = useMemo(() => {
    const source = isFresh ? state.transactions : [];
    return [...source].sort((a, b) => {
      const hasA = !!a.transactionDate;
      const hasB = !!b.transactionDate;
      if (hasA && hasB) return b.transactionDate.localeCompare(a.transactionDate);
      if (hasA) return -1;
      if (hasB) return 1;
      return 0;
    });
  }, [isFresh, state.transactions]);

  const error = isFresh ? state.error : null;

  return { transactions, loading, error };
}
