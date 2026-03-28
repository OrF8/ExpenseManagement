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
import { useState, useEffect } from 'react';
import { subscribeToBoards } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

export function useBoards() {
  const { user } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setBoards([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToBoards(
      user.uid,
      (data) => {
        console.log('Boards snapshot:', data);
        setBoards(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Boards subscription error:', err);
        setBoards([]);
        setError(err?.message || 'שגיאה בטעינת הלוחות');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return { boards, loading, error };
}
