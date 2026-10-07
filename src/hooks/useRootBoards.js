import {useEffect, useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../firebase/config';
import {useAuth} from '../context/AuthContext';
/** The home catalog returns roots only, including legacy roots and directly shared children.
 * Refresh on local mutations, focus, and every 30s for remote hierarchy changes. */
export function useRootBoards() {
  const {user} = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState({});
  useEffect(() => {
    if (!uid) return;
    let stopped = false, sequence = 0;
    async function refresh() {
      const current = ++sequence;
      try {
        const result = await httpsCallable(functions, 'listBoardRoots')({});
        if (!stopped && current === sequence) setState({uid, boards:result.data.boards});
      } catch (err) { if (!stopped && current === sequence) setState({uid, boards:[], error:err.message}); }
    }
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('boards-changed', refresh);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('boards-changed', refresh); };
  }, [uid]);
  return {boards:state.uid === uid ? state.boards ?? [] : [], loading:!!uid && state.uid !== uid, error:state.uid === uid ? state.error : null};
}
