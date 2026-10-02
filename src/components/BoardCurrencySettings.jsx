import { useState } from 'react';
import { CurrencySelector } from './CurrencySelector';
import { Button } from './ui/Button';
import { changeBoardCurrency } from '../firebase/boards';
import { currencyOf } from '../../functions/shared/money.mjs';
export function BoardCurrencySettings({ board, isOwner }) {
  const [currency, setCurrency] = useState(currencyOf(board));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (!window.confirm('כל ההמרות יחושבו מחדש מהסכומים המקוריים. שערים ידניים למטבע הישן יוחלפו. לוחות משנה לא ישתנו. להמשיך?')) return;
    setBusy(true); setError('');
    try { await changeBoardCurrency(board.id, currency, board.currencyRevision ?? 0); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-gray-200 p-3 my-4 dark:border-gray-700">
    <summary className="cursor-pointer text-sm">מטבע הלוח: {currencyOf(board)}</summary>
    {isOwner && <div className="mt-3 max-w-sm space-y-3">
      <CurrencySelector value={currency} onChange={setCurrency} label="מטבע הלוח" disabled={busy} />
      <p className="text-xs text-gray-500">עד 400 עסקאות. הסכומים והמטבעות המקוריים נשמרים.</p>
      <Button onClick={save} loading={busy} disabled={currency === currencyOf(board)}>שנה מטבע</Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>}
  </details>;
}
