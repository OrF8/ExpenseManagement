import { currencyDigits, validateRate } from './shared/money.mjs';
/** @param {string} text @param {string} base @param {string} quote @param {string} [today] @param {string} [provider] */
export function parseRateCsv(text, base, quote, today = new Date().toISOString().slice(0, 10), provider = 'frankfurter') {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid FX response size');
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 2 || lines[0] !== 'date,base,quote,rate') throw new Error('Unexpected FX response');
  const [date, actualBase, actualQuote, rate, extra] = lines[1].split(',');
  if (extra !== undefined || actualBase !== base || actualQuote !== quote) throw new Error('Unexpected FX currency pair');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > today) throw new Error('Invalid FX date');
  validateRate(rate);
  return { rate, rateDate: date, source: 'automatic', provider };
}
/** @param {string} base @param {string} quote */
export async function latestRate(base, quote, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  currencyDigits(base); currencyDigits(quote);
  const deadline = Date.now() + timeoutMs;
  /** @param {string|null} provider */
  const fetchRate = async (provider) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error('FX provider unavailable');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const providerFilter = provider ? `&providers=${provider}` : '';
      const response = await fetchImpl(`https://api.frankfurter.dev/v2/rates.csv?base=${base}&quotes=${quote}${providerFilter}`, { signal: controller.signal, headers: { Accept: 'text/csv' }, redirect: 'error' });
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 4096) throw new Error('FX provider unavailable');
      let text = ''; const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        text += decoder.decode(chunk, { stream: true });
        if (text.length > 4096) { controller.abort(); throw new Error('FX response too large'); }
      }
      text += decoder.decode();
      return parseRateCsv(text, base, quote, undefined, provider ?? 'frankfurter');
    } finally { clearTimeout(timer); }
  };
  if (base === 'ILS' || quote === 'ILS') {
    try {
      return await fetchRate('boi');
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
  }
  return fetchRate(null);
}
