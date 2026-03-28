/**
 * Custom hook for real-time board subscription.
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
    if (!user) {
      setBoards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToBoards(
      user.uid,
      (data) => {
        setBoards(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  return { boards, loading, error };
}
