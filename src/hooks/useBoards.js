/**
 * Custom hook for real-time board subscription.
 * State tracks the uid it was loaded for, so stale data from a previous
 * user is never shown and loading is correct across sign-in/sign-out.
 *
 * When Firestore returns `permission-denied` (which can happen when a user
 * has no boards yet, because the query filter can't be evaluated), the
 * subscription terminates. We retry automatically so that newly created
 * boards appear as soon as they exist.
 */
import { useState, useEffect, useRef } from 'react';
import { subscribeToBoards } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

const RETRY_DELAY_MS = 2000;

export function useBoards() {
  const { user } = useAuth();
  // forUid tracks which user's data is currently in state
  const [state, setState] = useState({ boards: [], error: null, forUid: null });
  const retryTimerRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    let unsubscribe;

    function subscribe() {
      unsubscribe = subscribeToBoards(
        user.uid,
        (data) => {
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          setState({ boards: data, error: null, forUid: user.uid });
        },
        (err) => {
          // Firestore emits `permission-denied` for array-contains queries
          // when the user has no boards yet. Treat it as an empty result and
          // retry so that boards created after the initial load appear.
          if (err.code === 'permission-denied') {
            setState({ boards: [], error: null, forUid: user.uid });
            retryTimerRef.current = setTimeout(subscribe, RETRY_DELAY_MS);
          } else {
            setState({ boards: [], error: err.message, forUid: user.uid });
          }
        }
      );
    }

    subscribe();

    return () => {
      if (unsubscribe) unsubscribe();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [user]);

  // loading while the subscription hasn't returned data for the current user yet
  const loading = !!user && state.forUid !== user.uid;
  const boards = state.forUid === user?.uid ? state.boards : [];
  const error = state.forUid === user?.uid ? state.error : null;

  return { boards, loading, error };
}
