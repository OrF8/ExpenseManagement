import { canonicalAmount, convert, currencyOf, currencyDigits, validateRate, boardAmount } from './shared/money.mjs';

/** Only trusted provider output or validated manual input may create snapshots. */
export async function resolveMoney({ previous, input = {}, targetCurrency, getRate, replaceTarget = false }) {
  currencyDigits(targetCurrency);
  const currency = input.currency ?? currencyOf(previous);
  currencyDigits(currency);
  const raw = input.amount ?? previous?.amount;
  const changed = !previous || currency !== currencyOf(previous) || (input.amount !== undefined && String(input.amount) !== String(previous.amount));
  const amount = changed ? canonicalAmount(raw, currency) : previous.amount;
  const fields = changed ? { amount, currency, moneyVersion: 1 } : {};
  const old = previous?.conversion;
  if (currency === targetCurrency) return { ...fields, conversion: null };
  const mode = input.fxMode ?? 'preserve';
  if (!['preserve', 'automatic', 'manual'].includes(mode)) throw new Error('Invalid conversion source');
  if (mode === 'manual') {
    const rate = validateRate(input.manualRate);
    return { ...fields, conversion: { targetCurrency, rate, convertedAmount: convert(amount, currency, rate, targetCurrency), rateDate: null, source: 'manual', provider: null } };
  }
  const reusable = !replaceTarget && old?.targetCurrency === targetCurrency && currency === currencyOf(previous);
  if (mode === 'preserve' && reusable) {
    if (!changed) { boardAmount(previous, targetCurrency); return { ...fields, conversion: old }; }
    if (old.source === 'manual') return { ...fields, conversion: { ...old, convertedAmount: convert(amount, currency, old.rate, targetCurrency) } };
  }
  const reference = await getRate(currency, targetCurrency);
  validateRate(reference.rate);
  if (reference.source !== 'automatic' || reference.provider !== 'frankfurter' || !/^\d{4}-\d{2}-\d{2}$/.test(reference.rateDate)) throw new Error('Invalid provider metadata');
  return { ...fields, conversion: { ...reference, targetCurrency, convertedAmount: convert(amount, currency, reference.rate, targetCurrency) } };
}
