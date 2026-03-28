/**
 * Displays per-card and grand total expense summaries.
 */
function formatAmount(amount) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
}

export function TotalsSummary({ totals }) {
  const cards = Object.entries(totals.perCard);
  if (cards.length === 0) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-5">
      <h3 className="text-sm font-semibold text-indigo-700 mb-3 uppercase tracking-wide">
        סיכום הוצאות
      </h3>
      <div className="space-y-2 mb-4">
        {cards.map(([card, total]) => (
          <div key={card} className="flex items-center justify-between text-sm">
            <span className="text-gray-600 font-mono">****{card}</span>
            <span className="font-semibold text-gray-800 tabular-nums">
              {formatAmount(total)}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-indigo-100 pt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">סה"כ</span>
        <span className="text-xl font-bold text-indigo-700 tabular-nums">
          {formatAmount(totals.grandTotal)}
        </span>
      </div>
    </div>
  );
}
