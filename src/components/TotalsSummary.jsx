/**
 * Displays per-type and grand total expense summaries.
 * Keys in totals.perGroup use the format "card:XXXX" (credit-card) or
 * "type:<typeName>" (cash / standing_order / unknown) so the display
 * can render them correctly without guessing from null values.
 *
 * When onFilterChange is provided, each row becomes clickable and acts as a
 * payment-method filter toggle. The activeFilterKey prop highlights the active row.
 */
import { TRANSACTION_TYPE_LABELS } from '../constants/transactionTypes';

function formatAmount(amount) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

export function TotalsSummary({ totals, activeFilterKey, onFilterChange }) {
  const groups = Object.entries(totals.perGroup);
  if (groups.length === 0) return null;

  const isInteractive = typeof onFilterChange === 'function';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-5 dark:from-indigo-950/50 dark:to-gray-900 dark:border-indigo-900">
      <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-3 uppercase tracking-wide">
        סיכום הוצאות
      </h3>
      <div className="space-y-1 mb-4">
        {groups.map(([key, total]) => {
          const isActive = key === activeFilterKey;
          let label;
          if (key.startsWith('card:')) {
            const last4 = key.slice(5);
            label = (
              <span className={`font-mono ${isActive ? 'text-indigo-700 dark:text-indigo-300 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                ****{last4}
              </span>
            );
          } else {
            const typeKey = key.slice(5); // strip "type:" prefix
            const typeLabel = TRANSACTION_TYPE_LABELS[typeKey] || typeKey;
            label = (
              <span className={isActive ? 'text-indigo-700 dark:text-indigo-300 font-semibold' : 'text-gray-600 dark:text-gray-400'}>
                {typeLabel}
              </span>
            );
          }

          const rowContent = (
            <>
              {label}
              <span className={`font-semibold tabular-nums ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>
                {formatAmount(total)}
              </span>
            </>
          );

          if (isInteractive) {
            return (
              <button
                key={key}
                type="button"
                onClick={() => onFilterChange(isActive ? null : key)}
                aria-pressed={isActive}
                className={`w-full flex items-center justify-between text-sm rounded-lg px-2 py-1.5 transition-colors text-right ${
                  isActive
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 ring-1 ring-indigo-300 dark:ring-indigo-700'
                    : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/60'
                }`}
              >
                {rowContent}
              </button>
            );
          }

          return (
            <div key={key} className="flex items-center justify-between text-sm px-2 py-1.5">
              {rowContent}
            </div>
          );
        })}
      </div>
      <div className="border-t border-indigo-100 dark:border-indigo-900 pt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">סה"כ</span>
        <span className="text-xl font-bold text-indigo-700 dark:text-indigo-400 tabular-nums">
          {formatAmount(totals.grandTotal)}
        </span>
      </div>
    </div>
  );
}
