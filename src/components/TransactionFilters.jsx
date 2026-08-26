import {useId, useMemo, useState} from 'react';
import {TRANSACTION_TYPE_LABELS} from '../constants/transactionTypes';
import {
  countActiveTransactionFilters,
  EMPTY_TRANSACTION_FILTERS,
  getTransactionPaymentFilterKey,
} from '../utils/transactionFilters';
import {Button} from './ui/Button';
import {Input} from './ui/Input';

function paymentFilterLabel(filterKey) {
  if (filterKey.startsWith('card:')) {
    const last4 = filterKey.slice(5);
    return last4 ? 'כרטיס ****' + last4 : 'כרטיס אשראי ללא 4 ספרות';
  }
  if (filterKey.startsWith('type:')) {
    const typeName = filterKey.slice(5);
    return TRANSACTION_TYPE_LABELS[typeName] || typeName;
  }
  return filterKey;
}

export function TransactionFilters({filters, transactions, visibleCount, onChange}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const activeFilterCount = countActiveTransactionFilters(filters);
  const hasActiveFilters = activeFilterCount > 0;
  const hasInvalidAmountRange =
    filters.minAmount !== '' &&
    filters.maxAmount !== '' &&
    Number(filters.minAmount) > Number(filters.maxAmount);

  const paymentOptions = useMemo(() => {
    const keys = [...new Set(transactions.map(getTransactionPaymentFilterKey))];
    return keys.sort((a, b) =>
      paymentFilterLabel(a).localeCompare(paymentFilterLabel(b), 'he'),
    );
  }, [transactions]);

  function setField(field, value) {
    onChange({...filters, [field]: value});
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-right transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400 dark:hover:bg-gray-700/60"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <svg className="h-4 w-4 shrink-0 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 01.8 1.6L14 13.67V19a1 1 0 01-.55.89l-4 2A1 1 0 018 21v-7.33L3.2 4.6A1 1 0 013 4z" />
          </svg>
          סינון עסקאות
          {hasActiveFilters && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
              {activeFilterCount}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {hasActiveFilters && (
            <span className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
              {visibleCount} מתוך {transactions.length}
            </span>
          )}
          <svg className={'h-4 w-4 text-gray-400 transition-transform ' + (isOpen ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div id={panelId} className="border-t border-gray-100 px-4 py-4 dark:border-gray-700">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="שם העסק, שם או הערות"
                type="search"
                value={filters.query}
                onChange={(event) => setField('query', event.target.value)}
                placeholder="הקלד כדי לחפש..."
              />
            </div>
            <Input
              label="תאריך עסקה"
              type="date"
              max="9999-12-31"
              value={filters.transactionDate}
              onChange={(event) => setField('transactionDate', event.target.value)}
            />
            <div className="min-w-0 flex flex-col gap-1">
              <label htmlFor={panelId + '-payment'} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                אמצעי תשלום
              </label>
              <select
                id={panelId + '-payment'}
                value={filters.paymentMethod}
                onChange={(event) => setField('paymentMethod', event.target.value)}
                className="block w-full max-w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900"
              >
                <option value="">כל אמצעי התשלום</option>
                {paymentOptions.map((key) => (
                  <option key={key} value={key}>{paymentFilterLabel(key)}</option>
                ))}
              </select>
            </div>
            <Input
              label="סכום מינימלי"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={filters.minAmount}
              onChange={(event) => setField('minAmount', event.target.value)}
              error={hasInvalidAmountRange ? 'הסכום המינימלי גבוה מהסכום המקסימלי' : undefined}
            />
            <Input
              label="סכום מקסימלי"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={filters.maxAmount}
              onChange={(event) => setField('maxAmount', event.target.value)}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
              {hasActiveFilters
                ? 'מוצגות ' + visibleCount + ' מתוך ' + transactions.length + ' עסקאות'
                : 'כל העסקאות בלוח מוצגות'}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!hasActiveFilters}
              onClick={() => onChange({...EMPTY_TRANSACTION_FILTERS})}
            >
              נקה את כל המסננים
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
