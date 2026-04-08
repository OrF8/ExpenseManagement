import { useState, useEffect } from 'react';
import { subscribeToBoards } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';
import { subscribeWithAppCheckRetry } from '../utils/appCheckRetry';

export function useBoards() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState({
    boards: [],
    error: null,
    retryingSecureConnection: false,
    forUid: null,
  });

  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeWithAppCheckRetry(
      (onData, onError) => subscribeToBoards(uid, onData, onError),
      (data) => {
        setState({
          boards: data,
          error: null,
          retryingSecureConnection: false,
          forUid: uid,
        });
      },
      (err) => {
        setState({
          boards: [],
          error: err?.message || 'שגיאה בטעינת הלוחות',
          retryingSecureConnection: false,
          forUid: uid,
        });
      },
      {
        onRetryAttempt: () => {
          setState((prev) => ({
            ...prev,
            retryingSecureConnection: true,
            error: null,
          }));
        },
      },
    );

    return () => {
      unsubscribe();
      setState({
        boards: [],
        error: null,
        retryingSecureConnection: false,
        forUid: null,
      });
    };
  }, [uid]);

  if (!uid) {
    return {
      boards: [],
      loading: false,
      error: null,
      retryingSecureConnection: false,
    };
  }

  const loading = state.forUid !== uid;
  return {
    boards: loading ? [] : state.boards,
    loading,
    error: loading ? null : state.error,
    retryingSecureConnection: loading ? false : state.retryingSecureConnection,
  };
}
