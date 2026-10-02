import { currencyDigits, currencyOf, BOARD_CURRENCY_CHANGE_LIMIT } from './shared/money.mjs';
import { resolveMoney } from './conversion.mjs';
import { latestRate } from './fx.mjs';

export class MoneyError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new MoneyError(code, message); };
function id(value) {
  if (typeof value !== 'string' || !value || value.length > 1500 || value.includes('/')) fail('invalid-argument', 'Invalid document ID');
  return value;
}
function authorize(snap, uid, owner = false) {
  if (!snap.exists) fail('not-found', 'הלוח לא נמצא');
  const board = snap.data();
  if (owner ? board.ownerUid !== uid : !board.memberUids?.includes(uid)) fail('permission-denied', 'אין הרשאה ללוח זה');
  return board;
}
function revision(actual, expected, label) {
  if (!Number.isSafeInteger(expected) || expected !== (actual ?? 0)) fail('failed-precondition', `${label} השתנה. יש לרענן ולנסות שוב.`);
}
const EDIT_FIELDS = ['name', 'essence', 'comment', 'type', 'cardLast4', 'installmentCurrent', 'installmentTotal', 'transactionDate', 'amount', 'currency', 'fxMode', 'manualRate'];
function validateFields(input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !EDIT_FIELDS.includes(k))) fail('invalid-argument', 'Invalid transaction fields');
  const data = { ...previous, ...input };
  for (const [key, max, required] of [['name',80,true],['essence',300,true],['comment',1000,false]]) {
    if ((!required && data[key] == null)) continue;
    if (typeof data[key] !== 'string' || data[key].length > max || (required && !data[key].trim())) fail('invalid-argument', `Invalid ${key}`);
  }
  if (!['credit_card','cash','standing_order'].includes(data.type)) fail('invalid-argument','Invalid payment type');
  if (data.transactionDate != null && (typeof data.transactionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.transactionDate) || !Number.isFinite(Date.parse(data.transactionDate)) || new Date(data.transactionDate).toISOString().slice(0,10) !== data.transactionDate)) fail('invalid-argument','Invalid transaction date');
  if (data.type === 'credit_card') {
    if (typeof data.cardLast4 !== 'string' || !/^\d{4}$/.test(data.cardLast4)) fail('invalid-argument','Invalid card');
    if (!(data.installmentCurrent == null && data.installmentTotal == null) && !(Number.isSafeInteger(data.installmentCurrent) && Number.isSafeInteger(data.installmentTotal) && data.installmentCurrent >= 1 && data.installmentCurrent <= data.installmentTotal)) fail('invalid-argument','Invalid installments');
  } else if (data.cardLast4 != null || data.installmentCurrent != null || data.installmentTotal != null) fail('invalid-argument','Unexpected card fields');
  return Object.fromEntries(Object.entries(input).filter(([k]) => !['amount','currency','fxMode','manualRate'].includes(k)));
}

/** All reads, authorization and conversion planning precede writes. Board moneyRevision
 * serializes transaction collection mutations with a board-wide currency change. */
export function createMoneyOperations({ db, timestamp, getRate = latestRate }) {
  const boardRef = boardId => db.collection('boards').doc(id(boardId));
  const touch = (tx, ref, board) => tx.update(ref, { currency: currencyOf(board), moneyRevision: (board.moneyRevision ?? 0) + 1 });
  const rateCache = () => {
    const cache = new Map();
    return (base, quote) => {
      const key = `${base}/${quote}`;
      if (!cache.has(key)) cache.set(key, getRate(base, quote).catch(() => fail('unavailable', 'לא ניתן לקבל שער חליפין. נסו שוב או הזינו שער ידני.')));
      return cache.get(key);
    };
  };
  return {
    async createBoard(uid, { title, currency = 'ILS' }) {
      if (typeof title !== 'string' || !title.trim() || title.length > 200) fail('invalid-argument','Invalid board title');
      currencyDigits(currency);
      const ref = db.collection('boards').doc();
      await ref.set({ title: title.trim(), currency, currencyRevision: 0, moneyRevision: 0, ownerUid: uid, memberUids: [uid], directMemberUids: [uid], createdAt: timestamp() });
      return { id: ref.id };
    },
    async saveTransaction(uid, { boardId, transactionId, input, expectedCurrencyRevision, expectedRevision }) {
      const br = boardRef(boardId); const tr = transactionId ? br.collection('transactions').doc(id(transactionId)) : br.collection('transactions').doc();
      const rate = rateCache();
      await db.runTransaction(async tx => {
        const bs = await tx.get(br); const board = authorize(bs, uid);
        revision(board.currencyRevision, expectedCurrencyRevision, 'מטבע הלוח');
        if (board.subBoardIds?.length) fail('failed-precondition','יש להוסיף עסקאות ללוח משנה');
        const old = transactionId ? await tx.get(tr) : null;
        if (transactionId && !old.exists) fail('not-found','העסקה לא נמצאה');
        const previous = old?.data();
        if (previous) revision(previous.revision, expectedRevision, 'העסקה');
        const fields = validateFields(input, previous);
        const money = await resolveMoney({ previous, input, targetCurrency: currencyOf(board), getRate: rate });
        const result = { ...fields, ...money, revision: (previous?.revision ?? 0) + 1, updatedAt: timestamp() };
        if (previous) tx.update(tr, result);
        else tx.create(tr, { ...result, createdByUid: uid, createdAt: timestamp() });
        touch(tx, br, board);
      });
      return { id: tr.id };
    },
    async deleteTransaction(uid, { boardId, transactionId }) {
      const br = boardRef(boardId); const tr = br.collection('transactions').doc(id(transactionId));
      await db.runTransaction(async tx => { const board = authorize(await tx.get(br), uid); tx.delete(tr); touch(tx, br, board); });
      return { success: true };
    },
    async changeBoardCurrency(uid, { boardId, currency, expectedCurrencyRevision, confirmReplaceConversions }) {
      currencyDigits(currency);
      if (confirmReplaceConversions !== true) fail('failed-precondition','יש לאשר החלפת המרות ושערים ידניים');
      const br = boardRef(boardId); const rate = rateCache();
      await db.runTransaction(async tx => {
        const board = authorize(await tx.get(br), uid, true);
        revision(board.currencyRevision, expectedCurrencyRevision, 'מטבע הלוח');
        if (currencyOf(board) === currency) return;
        const rows = await tx.get(br.collection('transactions').limit(BOARD_CURRENCY_CHANGE_LIMIT + 1));
        if (rows.size > BOARD_CURRENCY_CHANGE_LIMIT) fail('failed-precondition', `שינוי מטבע מוגבל ל-${BOARD_CURRENCY_CHANGE_LIMIT} עסקאות. הלוח לא שונה.`);
        const plans = await Promise.all(rows.docs.map(async row => ({ ref: row.ref, revision: (row.data().revision ?? 0) + 1, ...await resolveMoney({ previous: row.data(), targetCurrency: currency, getRate: rate, replaceTarget: true }) })));
        for (const { ref, ...plan } of plans) tx.update(ref, { ...plan, updatedAt: timestamp() });
        tx.update(br, { currency, currencyRevision: (board.currencyRevision ?? 0) + 1, moneyRevision: (board.moneyRevision ?? 0) + 1 });
      });
      return { success: true };
    },
    async transfer(uid, data, copy = false) {
      const { sourceBoardId, transactionId, expectedRevision, expectedCurrencyRevision } = data;
      const destinationIds = copy ? (data.destinationBoardIds ?? [data.destinationBoardId]) : [data.destinationBoardId];
      if (!Array.isArray(destinationIds) || !destinationIds.length || destinationIds.length > 50 || new Set(destinationIds).size !== destinationIds.length || destinationIds.includes(sourceBoardId)) fail('invalid-argument','Invalid destinations');
      const source = boardRef(sourceBoardId); const original = source.collection('transactions').doc(id(transactionId));
      const destinations = destinationIds.map(boardRef);
      const targets = destinations.map(br => copy ? br.collection('transactions').doc() : br.collection('transactions').doc(transactionId));
      const rate = rateCache();
      await db.runTransaction(async tx => {
        const sourceBoard = authorize(await tx.get(source), uid);
        revision(sourceBoard.currencyRevision, expectedCurrencyRevision, 'מטבע הלוח');
        const snap = await tx.get(original); if (!snap.exists) fail('not-found','העסקה לא נמצאה');
        const previous = snap.data(); revision(previous.revision, expectedRevision, 'העסקה');
        const boards = await Promise.all(destinations.map(async ref => authorize(await tx.get(ref), uid)));
        if (sourceBoard.subBoardIds?.length || boards.some(b => b.subBoardIds?.length)) fail('failed-precondition','יש לבחור לוחות רגילים');
        if (!copy && (await tx.get(targets[0])).exists) fail('already-exists','העסקה כבר קיימת בלוח היעד');
        const plans = await Promise.all(boards.map(board => resolveMoney({ previous, targetCurrency: currencyOf(board), getRate: rate })));
        targets.forEach((ref, i) => {
          tx.create(ref, { ...previous, ...plans[i], revision: (previous.revision ?? 0) + 1, updatedAt: timestamp(), ...(copy ? { createdAt: timestamp(), createdByUid: uid, duplicatedFrom: { boardId: sourceBoardId, transactionId }, duplicatedByUid: uid, duplicatedAt: timestamp() } : {}) });
          touch(tx, destinations[i], boards[i]);
        });
        if (!copy) { tx.delete(original); touch(tx, source, sourceBoard); }
      });
      return { success: true, duplicatedTransactions: targets.map((ref,i) => ({ boardId: destinationIds[i], transactionId: ref.id })) };
    },
  };
}
