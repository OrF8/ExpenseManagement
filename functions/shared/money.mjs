import metadata from './currencies.json' with { type: 'json' };

/** @typedef {{targetCurrency: string, rate: string, convertedAmount: string, source?: string, provider?: string|null, rateDate?: string|null}} Conversion */
/** @typedef {{amount: string|number, currency?: string, conversion?: Conversion|null, type?: string, cardLast4?: string|null}} Transaction */
/** @type {Readonly<Record<string, {name: string, digits: number}>>} */
export const CURRENCIES = Object.freeze(metadata);
export const DEFAULT_CURRENCY = 'ILS';
export const BOARD_CURRENCY_CHANGE_LIMIT = 400;
/** @param {{currency?: string}|null|undefined} record */
export const currencyOf = (record) => record?.currency ?? DEFAULT_CURRENCY;
/** @param {string} currency */
export function currencyDigits(currency) {
  if (typeof currency !== 'string' || !Object.hasOwn(CURRENCIES, currency)) throw new Error('Unsupported currency');
  return CURRENCIES[currency].digits;
}
/** @param {number} n */
const pow = (n) => 10n ** BigInt(n);
/** @param {string} value */
export function decimal(value, maxDigits = 18) {
  if (typeof value !== 'string' || value.length > 64 || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > maxDigits) throw new Error('Too many decimal places');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
/** @param {bigint} numerator @param {bigint} denominator */
export function roundRatio(numerator, denominator) {
  if (denominator <= 0n) throw new Error('Invalid denominator');
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator * sign;
  return sign * (magnitude / denominator + (magnitude % denominator * 2n >= denominator ? 1n : 0n));
}
/** @param {string|number} amount */
export function minorUnits(amount, currency = DEFAULT_CURRENCY, { legacy = false } = {}) {
  const digits = currencyDigits(currency);
  // Legacy numbers are interpreted from their decimal serialization, never arithmetically added.
  const parsed = decimal(typeof amount === 'number' ? (legacy ? legacyDecimal(amount) : (() => { throw new Error('Amount must be a decimal string'); })()) : amount, legacy ? 64 : 18);
  if (!legacy && parsed.scale > digits) throw new Error(`Currency supports ${digits} decimal places`);
  return roundRatio(parsed.units * pow(digits), pow(parsed.scale));
}
/** @param {bigint} units */
export function fromMinor(units, currency = DEFAULT_CURRENCY) {
  const digits = currencyDigits(currency);
  const sign = units < 0n ? '-' : '';
  const value = (units < 0n ? -units : units).toString().padStart(digits + 1, '0');
  return sign + (digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value);
}
/** @param {string} amount @param {string} currency */
export function canonicalAmount(amount, currency, { allowZero = false } = {}) {
  const units = minorUnits(amount, currency);
  const limit = 100000000n * pow(currencyDigits(currency));
  if ((!allowZero && units === 0n) || units <= -limit || units >= limit) throw new Error('Amount must be nonzero and between -100,000,000 and 100,000,000');
  return fromMinor(units, currency);
}
/** @param {string} rate */
export function validateRate(rate) {
  const parsed = decimal(rate);
  if (parsed.units <= 0n || parsed.units >= 1000000000000n * pow(parsed.scale)) throw new Error('Rate must be positive and less than 1,000,000,000,000');
  return rate;
}
/** @param {string|number} amount @param {string} originalCurrency @param {string} rate @param {string} targetCurrency */
export function convert(amount, originalCurrency, rate, targetCurrency) {
  currencyDigits(originalCurrency);
  const a = decimal(typeof amount === 'number' ? legacyDecimal(amount) : amount, typeof amount === 'number' ? 64 : 18);
  const r = decimal(validateRate(rate));
  return fromMinor(roundRatio(a.units * r.units * pow(currencyDigits(targetCurrency)), pow(a.scale + r.scale)), targetCurrency);
}
/** @param {Transaction} transaction @param {string} targetCurrency */
export function boardAmount(transaction, targetCurrency) {
  const originalCurrency = currencyOf(transaction);
  if (originalCurrency === targetCurrency) return fromMinor(minorUnits(transaction.amount, originalCurrency, { legacy: true }), targetCurrency);
  const c = transaction.conversion;
  if (!c || c.targetCurrency !== targetCurrency || c.convertedAmount !== convert(transaction.amount, originalCurrency, c.rate, targetCurrency)) throw new Error('Conversion is missing or outdated; reload the board');
  return c.convertedAmount;
}
/** @param {Transaction[]} transactions */
export function aggregateTransactions(transactions, currency = DEFAULT_CURRENCY) {
  /** @type {Record<string, bigint>} */
  const groups = {};
  /** @type {Record<string, bigint>} */
  const originals = {};
  let total = 0n;
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
/** @param {Record<string, string>[]} totals */
export function mergeCurrencyTotals(totals) {
  /** @type {Record<string, bigint>} */
  const result = {};
  for (const entry of totals) for (const [currency, amount] of Object.entries(entry)) result[currency] = (result[currency] ?? 0n) + minorUnits(amount, currency);
  return Object.fromEntries(Object.entries(result).map(([c, v]) => [c, fromMinor(v, c)]));
}
/** @param {string|number} amount */
export function formatMoney(amount, currency = DEFAULT_CURRENCY, locale = 'he-IL') {
  const exact = fromMinor(minorUnits(amount, currency, { legacy: true }), currency);
  // Intl accepts decimal strings without first losing precision through Number.
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: currencyDigits(currency), maximumFractionDigits: currencyDigits(currency) });
  // ECMA-402 accepts exact decimal strings. TypeScript's lib still omits that overload.
  const format = /** @type {(value: string) => string} */ (/** @type {unknown} */ (formatter.format));
  return format(exact);
}

/** Expand legacy Number serialization (including scientific notation) without arithmetic.
 * @param {number} value
 */
function legacyDecimal(value) {
  if (!Number.isFinite(value)) throw new Error('Invalid legacy amount');
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponent] = raw.split(/[eE]/);
  const sign = mantissa.startsWith('-') ? '-' : '';
  const parts = mantissa.replace('-', '').split('.');
  const digits = parts.join('');
  const point = parts[0].length + Number(exponent);
  if (point <= 0) return sign + '0.' + '0'.repeat(-point) + digits;
  return sign + (point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point));
}
