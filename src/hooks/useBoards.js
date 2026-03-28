/**
 * Custom hook for real-time board subscription.
 * State tracks the uid it was loaded for, so stale data from a previous
 * user is never shown and loading is correct across sign-in/sign-out.
 */
import { useState, useEffect } from 'react';
import { subscribeToBoards } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

export function useBoards() {
  const { user } = useAuth();
  // forUid tracks which user's data is currently in state
  const [state, setState] = useState({ boards: [], error: null, forUid: null });

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToBoards(
      user.uid,
      (data) => setState({ boards: data, error: null, forUid: user.uid }),
      (err) => {
        // Firestore can emit `permission-denied` for array-contains queries when
        // the user has no boards yet. Treat it as an empty result.
        if (err.code === 'permission-denied') {
          setState({ boards: [], error: null, forUid: user.uid });
        } else {
          setState({ boards: [], error: err.message, forUid: user.uid });
        }
      }
    );
    return unsub;
  }, [user]);

  // loading while the subscription hasn't returned data for the current user yet
  const loading = !!user && state.forUid !== user.uid;
  const boards = state.forUid === user?.uid ? state.boards : [];
  const error = state.forUid === user?.uid ? state.error : null;

  return { boards, loading, error };
}
