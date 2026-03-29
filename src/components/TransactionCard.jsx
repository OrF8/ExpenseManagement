/**
 * Single transaction row/card with edit and delete actions.
 */
import { useState } from 'react';
import { Button } from './ui/Button';

function formatAmount(amount) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

export function TransactionCard({ transaction, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function handleDelete() {
    if (!window.confirm('למחוק את העסקה הזו?')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(transaction.id);
    } catch (err) {
      setDeleteError(err.message || 'שגיאה במחיקה. נסה שוב.');
    } finally {
      setDeleting(false);
    }
  }

  const hasInstallments =
    transaction.installmentCurrent != null &&
    transaction.installmentTotal != null;

  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700 dark:hover:shadow-black/30">
      <div className="group flex items-start justify-between gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              {transaction.name}
            </span>
            <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-mono text-gray-500 dark:text-gray-400">
              ****{transaction.cardLast4}
            </span>
            {hasInstallments && (
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                תשלום {transaction.installmentCurrent} מתוך{' '}
                {transaction.installmentTotal}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{transaction.essence}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatAmount(transaction.amount)}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(transaction)}
              title="ערוך"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              loading={deleting}
              className="hover:text-red-500 dark:hover:text-red-400"
              title="מחק"
            >
              {!deleting && (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>
      {deleteError && (
        <p className="px-4 pb-3 text-xs text-red-500 dark:text-red-400" role="alert" aria-live="polite">
          {deleteError}
        </p>
      )}
    </div>
  );
}
