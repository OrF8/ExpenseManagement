/**
 * Board detail page - shows transactions and totals.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTransactions } from '../hooks/useTransactions';
import { useAuth } from '../context/AuthContext';
import { addTransaction, updateTransaction, deleteTransaction } from '../firebase/transactions';
import { subscribeToBoard } from '../firebase/boards';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionCard } from '../components/TransactionCard';
import { TotalsSummary } from '../components/TotalsSummary';
import { CollaboratorManager } from '../components/CollaboratorManager';

export function BoardPage() {
  const { boardId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { transactions, loading, error, totals } = useTransactions(boardId);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showCollabs, setShowCollabs] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Subscribe to real-time board metadata updates
  useEffect(() => {
    setBoardLoading(true);
    const unsub = subscribeToBoard(
      boardId,
      (b) => {
        if (!b || !b.memberUids.includes(user?.uid)) {
          setBoardLoading(false);
          navigate('/');
          return;
        }
        setBoard(b);
        setBoardLoading(false);
      },
      (err) => {
        setBoardError(err.message);
        setBoardLoading(false);
      }
    );
    return unsub;
  }, [boardId, user, navigate]);

  async function handleAdd(data) {
    setSubmitting(true);
    try {
      await addTransaction(boardId, data, user.uid);
      setShowAddModal(false);
    } finally {
      setSubmitting(false);
    }
    // Let errors propagate so TransactionForm can display them
  }

  async function handleEdit(data) {
    setSubmitting(true);
    try {
      await updateTransaction(boardId, editTx.id, data);
      setEditTx(null);
    } finally {
      setSubmitting(false);
    }
    // Let errors propagate so TransactionForm can display them
  }

  async function handleDelete(txId) {
    await deleteTransaction(boardId, txId);
    // Errors propagate to TransactionCard for display
  }

  if (boardLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (boardError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-red-500 dark:text-red-400 mb-4">{boardError}</p>
          <Button variant="secondary" onClick={() => navigate('/')}>חזרה</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="חזרה"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{board?.title}</h1>
          </div>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCollabs(true)}
              title="ניהול שיתוף"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              שיתוף
            </Button>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              עסקה חדשה
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Totals */}
        <TotalsSummary totals={totals} />

        {/* Transactions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            עסקאות
          </h2>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              שגיאה בטעינת עסקאות: {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={
                <svg className="h-14 w-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              }
              title="אין עסקאות עדיין"
              description="הוסף את העסקה הראשונה כדי להתחיל לעקוב"
              action={
                <Button onClick={() => setShowAddModal(true)}>
                  הוסף עסקה ראשונה
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {transactions.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  transaction={tx}
                  onEdit={(tx) => setEditTx(tx)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Transaction Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="עסקה חדשה"
      >
        <TransactionForm
          onSubmit={handleAdd}
          onCancel={() => setShowAddModal(false)}
          submitting={submitting}
        />
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal
        isOpen={!!editTx}
        onClose={() => setEditTx(null)}
        title="עריכת עסקה"
      >
        <TransactionForm
          initial={editTx}
          onSubmit={handleEdit}
          onCancel={() => setEditTx(null)}
          submitting={submitting}
        />
      </Modal>

      {/* Collaborators Modal */}
      <Modal
        isOpen={showCollabs}
        onClose={() => setShowCollabs(false)}
        title="ניהול שיתוף"
      >
        {board && <CollaboratorManager board={board} />}
      </Modal>
    </div>
  );
}
