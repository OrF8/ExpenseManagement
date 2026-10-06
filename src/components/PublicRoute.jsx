/** Routes reserved for signed-out visitors; wait for restored authentication. */
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui/Spinner';

export function PublicRoute({ children, deferRedirect = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (user && !deferRedirect) {
    return <Navigate to="/boards" replace />;
  }

  return children;
}
