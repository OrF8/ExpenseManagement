/**
 * Form for creating or editing a transaction.
 * Validates all fields per requirements.
 */
import { useState } from 'react';
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
};

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'שדה חובה';
  if (!/^\d{4}$/.test(form.cardLast4))
    errors.cardLast4 = 'יש להזין בדיוק 4 ספרות';
  if (!form.essence.trim()) errors.essence = 'שדה חובה';
  const amt = parseFloat(form.amount);
  if (!form.amount || isNaN(amt) || amt <= 0)
    errors.amount = 'סכום חייב להיות מספר חיובי';

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
  return errors;
}

export function TransactionForm({ initial, defaultName, onSubmit, onCancel, submitting }) {
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
        }
      : { ...EMPTY_FORM, name: defaultName || '' }
  );
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const data = {
      name: form.name.trim(),
      cardLast4: form.cardLast4,
      essence: form.essence.trim(),
      comment: form.comment.trim() || null,
      amount: parseFloat(form.amount),
      installmentCurrent:
        form.installmentCurrent !== ''
          ? parseInt(form.installmentCurrent, 10)
          : null,
      installmentTotal:
        form.installmentTotal !== ''
          ? parseInt(form.installmentTotal, 10)
          : null,
      type: form.type || null,
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
        <Input
          label="שם"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="ישראל ישראלי"
          error={errors.name}
        />
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
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          סוג עסקה (אופציונלי)
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
