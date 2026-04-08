import { useState, useEffect } from 'react';
import { subscribeToIncomingInvites } from '../firebase/boards';
import { useAuth } from '../context/AuthContext';

export function useIncomingInvites() {
  const { user } = useAuth();
  const email = user?.email ?? null;
  const [state, setState] = useState({
    invites: [],
    error: null,
    forEmail: null,
    forUser: null,
  });

  useEffect(() => {
    if (!email) return;

    const unsubscribe = subscribeToIncomingInvites(
      email,
      (data) => {
        setState({
          invites: data,
          error: null,
          forEmail: email,
          forUser: user,
        });
      },
      (err) => {
        setState({
          invites: [],
          error: err?.message || 'שגיאה בטעינת ההזמנות',
          forEmail: email,
          forUser: user,
        });
      },
    );

    return () => unsubscribe();
  }, [email, user]);

  if (!email) {
    return {
      invites: [],
      loading: false,
      error: null,
    };
  }

  const loading = state.forEmail !== email || state.forUser !== user;
  return {
    invites: loading ? [] : state.invites,
    loading,
    error: loading ? null : state.error,
  };
}
