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

  async function handleDelete() {
    if (!window.confirm('למחוק את העסקה הזו?')) return;
    setDeleting(true);
    try {
      await onDelete(transaction.id);
    } finally {
      setDeleting(false);
    }
  }

  const hasInstallments =
    transaction.installmentCurrent != null &&
    transaction.installmentTotal != null;

  return (
    <div className="group flex items-start justify-between gap-4 rounded-xl bg-white border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-gray-900 text-sm">
            {transaction.name}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-500">
            ****{transaction.cardLast4}
          </span>
          {hasInstallments && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600 font-medium">
              תשלום {transaction.installmentCurrent} מתוך{' '}
              {transaction.installmentTotal}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 truncate">{transaction.essence}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-base font-bold text-gray-900 tabular-nums">
          {formatAmount(transaction.amount)}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            className="hover:text-red-500"
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
  );
}
