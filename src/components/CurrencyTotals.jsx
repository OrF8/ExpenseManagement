import { formatMoney } from '../../functions/shared/money.mjs';
export function CurrencyTotals({ totals }) {
  if (!totals || !Object.keys(totals).length) return <span>—</span>;
  return <span className="flex flex-wrap gap-x-3 gap-y-1" data-testid="currency-totals">{Object.entries(totals).map(([currency, amount]) => <span key={currency} dir="ltr">{formatMoney(amount, currency)}</span>)}</span>;
}
