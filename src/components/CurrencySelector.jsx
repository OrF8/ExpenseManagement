import { useId, useState } from 'react';
import { CURRENCIES } from '../../functions/shared/money.mjs';
const common = ['ILS', 'EUR', 'USD', 'RSD', 'THB'];
export function CurrencySelector({ value, onChange, label = 'מטבע', disabled = false }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const codes = [...common, ...Object.keys(CURRENCIES).filter(c => !common.includes(c))];
  const matches = codes.filter(c => c === value || `${c} ${CURRENCIES[c].name}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="min-w-0 space-y-1">
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
    <input aria-label={`${label} — חיפוש`} placeholder="חיפוש לפי קוד או שם" value={search} onChange={e => setSearch(e.target.value)} disabled={disabled} className="w-full min-w-0 rounded-lg border border-gray-200 p-2 text-sm dark:border-gray-600 dark:bg-gray-800" />
    <select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} dir="ltr" className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 p-2 text-sm dark:border-gray-600 dark:bg-gray-800">
      {matches.map(c => <option key={c} value={c}>{c} — {CURRENCIES[c].name}</option>)}
    </select>
  </div>;
}
