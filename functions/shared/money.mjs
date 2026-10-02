import metadata from './currencies.json' with { type: 'json' };

export const CURRENCIES = Object.freeze(metadata);
export const DEFAULT_CURRENCY = 'ILS';
export const BOARD_CURRENCY_CHANGE_LIMIT = 400;
export const currencyOf = (record) => record?.currency ?? DEFAULT_CURRENCY;
export function currencyDigits(currency) {
  if (typeof currency !== 'string' || !Object.hasOwn(CURRENCIES, currency)) throw new Error('Unsupported currency');
  return CURRENCIES[currency].digits;
}
const pow = (n) => 10n ** BigInt(n);
export function decimal(value, maxDigits = 18) {
  if (typeof value !== 'string' || value.length > 64 || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > maxDigits) throw new Error('Too many decimal places');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
export function roundRatio(numerator, denominator) {
  if (denominator <= 0n) throw new Error('Invalid denominator');
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator * sign;
  return sign * (magnitude / denominator + (magnitude % denominator * 2n >= denominator ? 1n : 0n));
}
export function minorUnits(amount, currency = DEFAULT_CURRENCY, { legacy = false } = {}) {
  const digits = currencyDigits(currency);
  // Legacy numbers are interpreted from their decimal serialization, never arithmetically added.
  const parsed = decimal(legacy && typeof amount === 'number' ? String(amount) : amount);
  if (!legacy && parsed.scale > digits) throw new Error(`Currency supports ${digits} decimal places`);
  return roundRatio(parsed.units * pow(digits), pow(parsed.scale));
}
export function fromMinor(units, currency = DEFAULT_CURRENCY) {
  const digits = currencyDigits(currency);
  const sign = units < 0n ? '-' : '';
  const value = (units < 0n ? -units : units).toString().padStart(digits + 1, '0');
  return sign + (digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value);
}
export function canonicalAmount(amount, currency, { allowZero = false } = {}) {
  const units = minorUnits(amount, currency);
  const limit = 100000000n * pow(currencyDigits(currency));
  if ((!allowZero && units === 0n) || units <= -limit || units >= limit) throw new Error('Amount must be nonzero and between -100,000,000 and 100,000,000');
  return fromMinor(units, currency);
}
export function validateRate(rate) {
  const parsed = decimal(rate);
  if (parsed.units <= 0n || parsed.units >= 1000000000000n * pow(parsed.scale)) throw new Error('Rate must be positive and less than 1,000,000,000,000');
  return rate;
}
export function convert(amount, originalCurrency, rate, targetCurrency) {
  currencyDigits(originalCurrency);
  const a = decimal(typeof amount === 'number' ? String(amount) : amount);
  const r = decimal(validateRate(rate));
  return fromMinor(roundRatio(a.units * r.units * pow(currencyDigits(targetCurrency)), pow(a.scale + r.scale)), targetCurrency);
}
export function boardAmount(transaction, targetCurrency) {
  const originalCurrency = currencyOf(transaction);
  if (originalCurrency === targetCurrency) return fromMinor(minorUnits(transaction.amount, originalCurrency, { legacy: true }), targetCurrency);
  const c = transaction.conversion;
  if (!c || c.targetCurrency !== targetCurrency || c.convertedAmount !== convert(transaction.amount, originalCurrency, c.rate, targetCurrency)) throw new Error('Conversion is missing or outdated; reload the board');
  return c.convertedAmount;
}
export function aggregateTransactions(transactions, currency = DEFAULT_CURRENCY) {
  const groups = {}; const originals = {}; let total = 0n;
  for (const tx of transactions) {
    const amount = minorUnits(boardAmount(tx, currency), currency);
    const key = tx.type === 'credit_card' ? `card:${tx.cardLast4 ?? ''}` : `type:${tx.type ?? 'unknown'}`;
    groups[key] = (groups[key] ?? 0n) + amount;
    total += amount;
    const original = currencyOf(tx);
    originals[original] = (originals[original] ?? 0n) + minorUnits(tx.amount, original, { legacy: true });
  }
  return { currency, grandTotal: fromMinor(total, currency), perGroup: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, fromMinor(v, currency)])), originals: Object.fromEntries(Object.entries(originals).map(([k, v]) => [k, fromMinor(v, k)])) };
}
export function mergeCurrencyTotals(totals) {
  const result = {};
  for (const entry of totals) for (const [currency, amount] of Object.entries(entry)) result[currency] = (result[currency] ?? 0n) + minorUnits(amount, currency);
  return Object.fromEntries(Object.entries(result).map(([c, v]) => [c, fromMinor(v, c)]));
}
export function formatMoney(amount, currency = DEFAULT_CURRENCY, locale = 'he-IL') {
  const exact = fromMinor(minorUnits(amount, currency, { legacy: true }), currency);
  // Intl accepts decimal strings without first losing precision through Number.
  return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: currencyDigits(currency), maximumFractionDigits: currencyDigits(currency) }).format(exact);
}
