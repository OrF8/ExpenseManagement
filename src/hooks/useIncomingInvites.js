import { useState, useEffect } from 'react';
import { subscribeToIncomingInvites } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

export function useIncomingInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.email) {
      setInvites([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToIncomingInvites(
      user.email,
      (data) => {
        setInvites(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setInvites([]);
        setError(err?.message || 'שגיאה בטעינת ההזמנות');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.email]);

  return { invites, loading, error };
}
