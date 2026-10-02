import { boardAmount, minorUnits } from '../../functions/shared/money.mjs';
export const EMPTY_TRANSACTION_FILTERS = Object.freeze({
  query: '',
  transactionDate: '',
  paymentMethod: '',
  minAmount: '',
  maxAmount: '',
});

function normalizeSearchValue(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('he-IL');
}

export function getTransactionPaymentFilterKey(transaction) {
  return transaction.type === 'credit_card'
    ? 'card:' + (transaction.cardLast4 ?? '')
    : 'type:' + (transaction.type ?? 'unknown');
}

export function countActiveTransactionFilters(filters) {
  return Object.values(filters).filter((value) => String(value ?? '').trim() !== '').length;
}

export function filterTransactions(transactions, filters, currency = 'ILS') {
  const query = normalizeSearchValue(filters.query);
  const hasMinAmount = String(filters.minAmount ?? '').trim() !== '';
  const hasMaxAmount = String(filters.maxAmount ?? '').trim() !== '';
  const minAmount = hasMinAmount ? minorUnits(filters.minAmount, currency, {legacy: true}) : null;
  const maxAmount = hasMaxAmount ? minorUnits(filters.maxAmount, currency, {legacy: true}) : null;

  return transactions.filter((transaction) => {
    if (query) {
      const searchableText = [transaction.essence, transaction.name, transaction.comment]
        .map(normalizeSearchValue)
        .join(' ');
      if (!searchableText.includes(query)) return false;
    }

    if (
      filters.transactionDate &&
      transaction.transactionDate !== filters.transactionDate
    ) return false;

    if (
      filters.paymentMethod &&
      getTransactionPaymentFilterKey(transaction) !== filters.paymentMethod
    ) return false;

    const amount = minorUnits(boardAmount(transaction, currency), currency);
    if (hasMinAmount && amount < minAmount) return false;
    if (hasMaxAmount && amount > maxAmount) return false;

    return true;
  });
}
