/**
 * Custom hook for real-time board subscription.
 */
import { useState, useEffect } from 'react';
import { subscribeToBoards } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

export function useBoards() {
  const { user } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToBoards(
      user.uid,
      (data) => {
        setBoards(data);
        setLoaded(true);
      },
      (err) => {
        setError(err.message);
        setLoaded(true);
      }
    );
    return unsub;
  }, [user]);

  // loading is true while user exists but data hasn't arrived yet
  const loading = !!user && !loaded;
  return { boards, loading, error };
}
