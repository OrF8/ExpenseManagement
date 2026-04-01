/**
 * Form for creating or editing a transaction.
 * Validates all fields per requirements.
 */
import { useState, useMemo } from 'react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { TRANSACTION_TYPE_LABELS } from '../constants/transactionTypes';

const EMPTY_FORM = {
  name: '',
  cardLast4: '',
  essence: '',
  comment: '',
  amount: '',
  installmentCurrent: '',
  installmentTotal: '',
  type: '',
  transactionDate: '',
};

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'שדה חובה';
  if (!form.type) errors.type = 'יש לבחור סוג עסקה';
  if (!form.essence.trim()) errors.essence = 'שדה חובה';
  const amt = parseFloat(form.amount);
  if (!form.amount || isNaN(amt) || amt <= 0)
    errors.amount = 'סכום חייב להיות מספר חיובי';

  if (form.transactionDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(form.transactionDate)) {
      errors.transactionDate = 'תאריך לא תקין';
    } else {
      const [y, m, d] = form.transactionDate.split('-').map(Number);
      const parsed = new Date(y, m - 1, d);
      if (
        parsed.getFullYear() !== y ||
        parsed.getMonth() + 1 !== m ||
        parsed.getDate() !== d
      ) {
        errors.transactionDate = 'תאריך לא תקין';
      } else {
        const today = new Date();
        const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (parsed > todayNorm) errors.transactionDate = 'לא ניתן להזין תאריך עתידי';
      }
    }
  }

  if (form.type === 'credit_card') {
    if (!/^\d{4}$/.test(form.cardLast4))
      errors.cardLast4 = 'יש להזין בדיוק 4 ספרות';

    const hasCurrent = form.installmentCurrent !== '';
    const hasTotal = form.installmentTotal !== '';
    if (hasCurrent !== hasTotal) {
      const msg = 'יש למלא את שני שדות התשלומים או לרוקן שניהם';
      if (!hasCurrent) errors.installmentCurrent = msg;
      if (!hasTotal) errors.installmentTotal = msg;
    } else if (hasCurrent && hasTotal) {
      const cur = parseInt(form.installmentCurrent, 10);
      const tot = parseInt(form.installmentTotal, 10);
      if (isNaN(cur) || !Number.isInteger(cur) || cur < 1)
        errors.installmentCurrent = 'מספר תשלום נוכחי חייב להיות מספר שלם חיובי';
      if (isNaN(tot) || !Number.isInteger(tot) || tot < 1)
        errors.installmentTotal = 'סך תשלומים חייב להיות מספר שלם חיובי';
      if (!errors.installmentCurrent && !errors.installmentTotal && cur > tot)
        errors.installmentCurrent = 'תשלום נוכחי לא יכול לעלות על סך התשלומים';
    }
  }
  return errors;
}

/**
 * @param {object} [initial]         – Existing transaction data for edit mode.
 * @param {string} [defaultName]     – Pre-filled name for create mode.
 * @param {{type: string, cardLast4?: string}} [defaultPaymentMethod]
 *   Pre-fills just the payment-method fields (type + cardLast4) in create mode,
 *   without triggering edit-mode behaviour (submit button stays "הוסף עסקה").
 */
export function TransactionForm({ initial, defaultName, defaultPaymentMethod, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name || '',
          cardLast4: initial.cardLast4 || '',
          essence: initial.essence || '',
          comment: initial.comment || '',
          amount: initial.amount != null ? String(initial.amount) : '',
          installmentCurrent:
            initial.installmentCurrent != null
              ? String(initial.installmentCurrent)
              : '',
          installmentTotal:
            initial.installmentTotal != null
              ? String(initial.installmentTotal)
              : '',
          type: initial.type || '',
          transactionDate: initial.transactionDate || '',
        }
      : {
          ...EMPTY_FORM,
          name: defaultName || '',
          type: defaultPaymentMethod?.type || '',
          cardLast4: defaultPaymentMethod?.cardLast4 || '',
        }
  );
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (name === 'type') {
      setErrors((prev) => {
        const next = { ...prev, type: undefined };
        if (value !== 'credit_card') {
          delete next.cardLast4;
          delete next.installmentCurrent;
          delete next.installmentTotal;
        }
        return next;
      });
    } else if (errors[name]) {
      setErrors((e) => ({ ...e, [name]: undefined }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const isCreditCard = form.type === 'credit_card';
    const data = {
      name: form.name.trim(),
      cardLast4: isCreditCard ? form.cardLast4 : null,
      essence: form.essence.trim(),
      comment: form.comment.trim() || null,
      amount: parseFloat(form.amount),
      installmentCurrent: isCreditCard && form.installmentCurrent !== ''
        ? parseInt(form.installmentCurrent, 10)
        : null,
      installmentTotal: isCreditCard && form.installmentTotal !== ''
        ? parseInt(form.installmentTotal, 10)
        : null,
      type: form.type,
      transactionDate: form.transactionDate || null,
    };
    try {
      setSubmitError(null);
      await onSubmit(data);
    } catch (err) {
      setSubmitError(err.message || 'שגיאה בשמירת העסקה. נסה שוב.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={form.type !== 'credit_card' ? 'sm:col-span-2' : ''}>
          <Input
            label="שם"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="ישראל ישראלי"
            error={errors.name}
          />
        </div>
        {form.type === 'credit_card' && (
          <Input
            label="4 ספרות אחרונות של הכרטיס"
            name="cardLast4"
            value={form.cardLast4}
            onChange={handleChange}
            placeholder="1234"
            maxLength={4}
            inputMode="numeric"
            error={errors.cardLast4}
          />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          סוג עסקה
        </label>
        <select
          name="type"
          value={form.type}
          onChange={handleChange}
          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900"
        >
          <option value="">בחר סוג עסקה</option>
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {errors.type && (
          <p className="text-xs text-red-500 mt-0.5" role="alert">{errors.type}</p>
        )}
      </div>
      <Input
        label="מהות העסקה"
        name="essence"
        value={form.essence}
        onChange={handleChange}
        placeholder="תאר את העסקה..."
        error={errors.essence}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          הערה (אופציונלי)
        </label>
        <textarea
          name="comment"
          value={form.comment}
          onChange={handleChange}
          placeholder="הוסף הערה לעסקה..."
          rows={2}
          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900 resize-none"
        />
      </div>
      <Input
        label="סכום (₪)"
        name="amount"
        type="number"
        min="0.01"
        step="0.01"
        value={form.amount}
        onChange={handleChange}
        placeholder="0.00"
        error={errors.amount}
      />
      <Input
        label="תאריך עסקה (אופציונלי)"
        name="transactionDate"
        type="date"
        max={todayStr}
        value={form.transactionDate}
        onChange={handleChange}
        error={errors.transactionDate}
      />
      {form.type === 'credit_card' && (
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 border border-gray-100 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
          פירוט תשלומים (אופציונלי)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="תשלום נוכחי"
            name="installmentCurrent"
            type="number"
            min="1"
            step="1"
            value={form.installmentCurrent}
            onChange={handleChange}
            placeholder="1"
            error={errors.installmentCurrent}
          />
          <Input
            label="מתוך כמה תשלומים"
            name="installmentTotal"
            type="number"
            min="1"
            step="1"
            value={form.installmentTotal}
            onChange={handleChange}
            placeholder="12"
            error={errors.installmentTotal}
          />
        </div>
      </div>
      )}
      <div className="flex gap-3 pt-2 justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
        <Button type="submit" loading={submitting}>
          {initial ? 'עדכן עסקה' : 'הוסף עסקה'}
        </Button>
      </div>
      {submitError && (
        <p className="text-sm text-red-500 text-center" role="alert" aria-live="polite">
          {submitError}
        </p>
      )}
    </form>
  );
}
