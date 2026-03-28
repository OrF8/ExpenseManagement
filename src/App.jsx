import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { AuthPage } from './pages/AuthPage';
import { BoardsPage } from './pages/BoardsPage';
import { BoardPage } from './pages/BoardPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <BoardsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/board/:boardId"
            element={
              <PrivateRoute>
                <BoardPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
