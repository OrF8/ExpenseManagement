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
        setBoards(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setBoards([]);
        setError(err?.message || 'שגיאה בטעינת הלוחות');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return { boards, loading, error };
}
