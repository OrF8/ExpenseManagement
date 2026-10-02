import { aggregateTransactions, currencyOf } from '../../functions/shared/money.mjs';
/**
 * Firestore operations for transactions.
 * Subcollection: boards/{boardId}/transactions/{transactionId}
 */
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const txRef = (boardId) =>
  collection(db, 'boards', boardId, 'transactions');

/**
 * Subscribe to real-time transaction updates for a board.
 * @param {string} boardId
 * @param {function} onData - Callback receiving array of transaction objects
 * @param {function} onError - Error callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToTransactions(boardId, onData, onError) {
  const q = query(txRef(boardId), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(txs);
    },
    onError
  );
}

/**
 * Add a new transaction to a board.
 * @param {string} boardId
 * @param {object} data - Transaction fields
 * @param {number} expectedCurrencyRevision - Board revision captured by the editor
 */
export async function addTransaction(boardId, input, expectedCurrencyRevision) {
  return httpsCallable(functions, 'saveTransaction')({boardId, input, expectedCurrencyRevision});
}
export async function updateTransaction(boardId, transactionId, input, expectedCurrencyRevision, expectedRevision) {
  return httpsCallable(functions, 'saveTransaction')({boardId, transactionId, input, expectedCurrencyRevision, expectedRevision});
}
export async function deleteTransaction(boardId, transactionId) {
  return httpsCallable(functions, 'deleteTransaction')({boardId, transactionId});
}

export async function getTransactionsForBoard(boardId) {
  const q = query(txRef(boardId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Compute the grand total of all transaction amounts for a board (one-shot read).
 * @param {string} boardId
 * @returns {Promise<Record<string, string>>} Exact totals grouped by currency
 */
export async function getBoardTotal(boardId) {
  // Double-read the revision around the query so a currency change cannot mix snapshots.
  for (let attempt = 0; attempt < 3; attempt++) {
    const readBoard = () => runTransaction(db, async tx => (await tx.get(doc(db, 'boards', boardId))).data());
    const before = await readBoard();
    const snap = await getDocs(txRef(boardId));
    const after = await readBoard();
    if ((before?.moneyRevision ?? 0) !== (after?.moneyRevision ?? 0)) continue;
    const currency = currencyOf(after);
    return {[currency]: aggregateTransactions(snap.docs.map(d => d.data()), currency).grandTotal};
  }
  throw new Error('הלוח השתנה. יש לרענן.');
}

/**
 * Move transaction between boards via secure callable function.
 */
export async function moveTransaction(sourceBoardId, destinationBoardId, transactionId, expectedCurrencyRevision, expectedRevision) {
  const fn = httpsCallable(functions, 'moveTransaction');
  try {
    const result = await fn({ sourceBoardId, destinationBoardId, transactionId, expectedCurrencyRevision, expectedRevision });
    return result.data;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'functions/unauthenticated') throw new Error('עליך להתחבר מחדש כדי להעביר עסקה.');
    if (code === 'functions/permission-denied') throw new Error('אין לך הרשאה להעביר עסקה לאחד הלוחות שנבחרו.');
    if (code === 'functions/not-found') throw new Error(err?.message || 'העסקה לא נמצאה. ייתכן שהיא נמחקה או הועברה כבר.');
    if (code === 'functions/already-exists') throw new Error('כבר קיימת עסקה עם אותו מזהה בלוח היעד.');
    if (code === 'functions/failed-precondition') throw new Error(err?.message || 'לא ניתן להעביר את העסקה.');
    throw new Error(err?.message || 'אירעה שגיאה בעת העברת העסקה. נסה שוב.');
  }
}

/**
 * Duplicate transaction to another board via secure callable function.
 */
export async function duplicateTransaction(sourceBoardId, destinationBoardIdsOrId, transactionId, expectedCurrencyRevision, expectedRevision) {
  const fn = httpsCallable(functions, 'duplicateTransaction');
  const payload = Array.isArray(destinationBoardIdsOrId)
    ? { sourceBoardId, destinationBoardIds: destinationBoardIdsOrId, transactionId }
    : { sourceBoardId, destinationBoardId: destinationBoardIdsOrId, transactionId };

  try {
    const result = await fn({...payload, expectedCurrencyRevision, expectedRevision});
    return result.data;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'functions/unauthenticated') throw new Error('עליך להתחבר מחדש כדי לשכפל עסקה.');
    if (code === 'functions/permission-denied') throw new Error('אין לך הרשאה לשכפל עסקה לאחד הלוחות שנבחרו.');
    if (code === 'functions/not-found') throw new Error(err?.message || 'העסקה לא נמצאה. ייתכן שהיא נמחקה.');
    if (code === 'functions/failed-precondition') throw new Error(err?.message || 'לא ניתן לשכפל את העסקה.');
    throw new Error(err?.message || 'אירעה שגיאה בעת שכפול העסקה. נסה שוב.');
  }
}
