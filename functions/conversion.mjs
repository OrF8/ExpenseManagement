import { canonicalAmount, convert, currencyOf, currencyDigits, validateRate, boardAmount } from './shared/money.mjs';

/** Only trusted provider output or validated manual input may create snapshots.
 * @param {{previous?: import('./shared/money.mjs').Transaction, input?: {amount?: string, currency?: string, fxMode?: string, manualRate?: string}, targetCurrency: string, getRate: (base: string, quote: string) => Promise<{rate: string, rateDate: string, source: string, provider: string}>, replaceTarget?: boolean}} options
 */
export async function resolveMoney({ previous, input = {}, targetCurrency, getRate, replaceTarget = false }) {
  currencyDigits(targetCurrency);
  if (Object.hasOwn(input, 'amount') && typeof input.amount !== 'string') throw new Error('Amount must be a decimal string');
  if (Object.hasOwn(input, 'currency') && typeof input.currency !== 'string') throw new Error('Currency must be an ISO code');
  const mode = input.fxMode === undefined ? 'preserve' : input.fxMode;
  if (!['preserve', 'automatic', 'manual'].includes(mode)) throw new Error('Invalid conversion source');
  if (Object.hasOwn(input, 'manualRate')) validateRate(input.manualRate ?? '');
  const currency = input.currency ?? currencyOf(previous);
  currencyDigits(currency);
  if (input.amount !== undefined) canonicalAmount(input.amount, currency);
  const raw = input.amount ?? previous?.amount;
  const changed = !previous || currency !== currencyOf(previous) || (input.amount !== undefined && String(input.amount) !== String(previous.amount));
  if (raw === undefined) throw new Error('Amount is required');
  if (changed && typeof raw !== 'string') throw new Error('New amounts must be decimal strings');
  const amount = changed ? canonicalAmount(/** @type {string} */ (raw), currency) : raw;
  const fields = changed ? { amount, currency, moneyVersion: 1 } : {};
  const old = previous?.conversion;
  if (currency === targetCurrency) return { ...fields, conversion: null };
  if (mode === 'manual') {
    const rate = validateRate(input.manualRate ?? '');
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
