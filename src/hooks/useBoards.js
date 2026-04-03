import { useState, useEffect } from 'react';
import { subscribeToBoards } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';
import { subscribeWithAppCheckRetry } from '../utils/appCheckRetry';

export function useBoards() {
  const { user } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryingSecureConnection, setRetryingSecureConnection] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setBoards([]);
      setLoading(false);
      setError(null);
      setRetryingSecureConnection(false);
      return;
    }

    setLoading(true);
    setError(null);
    setRetryingSecureConnection(false);

    const unsubscribe = subscribeWithAppCheckRetry(
      (onData, onError) => subscribeToBoards(user.uid, onData, onError),
      (data) => {
        setBoards(data);
        setError(null);
        setRetryingSecureConnection(false);
        setLoading(false);
      },
      (err) => {
        setBoards([]);
        setError(err?.message || 'שגיאה בטעינת הלוחות');
        setRetryingSecureConnection(false);
        setLoading(false);
      },
      {
        onRetryAttempt: () => {
          setRetryingSecureConnection(true);
          setLoading(true);
          setError(null);
        },
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return { boards, loading, error, retryingSecureConnection };
}
