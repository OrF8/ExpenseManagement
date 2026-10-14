import { currencyDigits } from '../../functions/shared/money.mjs';

const MAX_CELL_LENGTH = 32767;
const PRECISION_NOTE = 'הערך נשמר כטקסט מדויק כדי למנוע אובדן ספרות ב-Excel; אינו נכלל בחישובים מספריים רגילים.';

/** Strip XML-illegal controls and unpaired surrogates without splitting Unicode. */
export function cleanExcelText(value) {
  return Array.from(String(value ?? ''), char => {
    const code = char.codePointAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) ||
      (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe || code === 0xffff ? '' : char;
  }).join('');
}

export function excelText(value) {
  const text = cleanExcelText(value);
  const escaped = /^\s*[=+\-@]/u.test(text) ? `'${text}` : text;
  if (escaped.length > MAX_CELL_LENGTH) {
    throw new Error('טקסט או נתיב לוח ארוך ממגבלת התא של Excel. לא נוצר קובץ חלקי.');
  }
  return escaped;
}

export function truncateUnicode(value, maxLength) {
  let result = '';
  for (const char of value) {
    if (result.length + char.length > maxLength) break;
    result += char;
  }
  return result;
}

/** Expand decimal notation for comparison only; never calculate money in Number. */
function decimalParts(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new Error('ערך כספי לא תקין. לא נוצר קובץ חלקי.');
  let digits = (match[2] + (match[3] || '')).replace(/^0+/, '') || '0';
  let scale = (match[3]?.length || 0) - Number(match[4] || 0);
  if (Math.abs(scale) > 1000) throw new Error('ערך כספי מחוץ לטווח הנתמך לייצוא.');
  while (digits.length > 1 && digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    scale -= 1;
  }
  if (digits === '0') return { key: '0', digits, scale: 0 };
  return { key: `${match[1]}${digits}:${scale}`, digits, scale };
}

/** Excel has 15 significant decimal digits. Only use a numeric cell if both
 * Number serialization and Excel's 15-digit representation preserve the value.
 * Excess fractional precision remains text rather than being hidden by formatting.
 * The string fallback is an explicit ExcelJS string, never a formula object. */
export function excelDecimal(value, { currency } = {}) {
  if (value == null || value === '') return '';
  const exact = String(value);
  const parts = decimalParts(exact);
  const numeric = Number(exact);
  const safe = parts.digits.length <= 15 && Number.isFinite(numeric) &&
    (numeric === 0 || Math.abs(numeric) >= 2.2250738585072014e-308) &&
    (currency === undefined || parts.scale <= currencyDigits(currency)) &&
    decimalParts(String(numeric)).key === parts.key &&
    decimalParts(numeric.toPrecision(15)).key === parts.key;
  return safe ? numeric : exact;
}

export function moneyNumberFormat(currency) {
  const digits = currencyDigits(currency);
  return '#,##0' + (digits ? '.' + '0'.repeat(digits) : '');
}

export function styleDecimalCell(cell, currency) {
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  if (typeof cell.value === 'string' && cell.value !== '') {
    cell.numFmt = '@';
    cell.note = PRECISION_NOTE;
    cell.font = { color: { argb: 'FF92400E' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  } else {
    // General preserves significant rate digits, including very small rates.
    cell.numFmt = currency ? moneyNumberFormat(currency) : 'General';
  }
}

export function parseExportDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  }
  const timestamp = exportTimestamp(value);
  if (!timestamp) return null;
  const date = new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1e6));
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Supports SDK Timestamp, callable-serialized Timestamp, Date, ISO and millis.
 * Keep nanos separate so equal-day transactions retain their actual ordering. */
function exportTimestamp(value) {
  if (value == null || value === '') return null;
  const seconds = value?.seconds ?? value?._seconds;
  const nanoseconds = value?.nanoseconds ?? value?._nanoseconds ?? 0;
  if (Number.isSafeInteger(seconds) && Number.isInteger(nanoseconds) && nanoseconds >= 0 && nanoseconds < 1e9) {
    return { seconds, nanoseconds };
  }
  const millis = value instanceof Date ? value.getTime() : typeof value === 'number' ? value :
    typeof value?.toMillis === 'function' ? value.toMillis() : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(millis)) return null;
  const wholeSeconds = Math.floor(millis / 1000);
  return { seconds: wholeSeconds, nanoseconds: Math.round((millis - wholeSeconds * 1000) * 1e6) };
}

export const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function orderExportTransactions(transactions) {
  return transactions.map(tx => ({ tx, date: parseExportDate(tx.transactionDate)?.getTime() ?? null,
    created: exportTimestamp(tx.createdAt) }))
    .sort((a, b) => {
      if ((a.date === null) !== (b.date === null)) return a.date === null ? 1 : -1;
      if (a.date !== b.date) return b.date - a.date;
      if (!a.created !== !b.created) return a.created ? -1 : 1;
      if (a.created && b.created) {
        const diff = b.created.seconds - a.created.seconds || b.created.nanoseconds - a.created.nanoseconds;
        if (diff) return diff;
      }
      return compareText(a.tx.id, b.tx.id);
    }).map(({ tx }) => tx);
}
