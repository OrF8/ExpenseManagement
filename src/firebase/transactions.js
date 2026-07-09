/**
 * Firestore operations for transactions.
 * Subcollection: boards/{boardId}/transactions/{transactionId}
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
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
 * @param {string} uid - Creator's UID
 */
export async function addTransaction(boardId, data, uid) {
  return addDoc(txRef(boardId), {
    ...data,
    createdByUid: uid,
    createdAt: serverTimestamp(),
  });
}

/**
 * Update an existing transaction.
 * @param {string} boardId
 * @param {string} txId
 * @param {object} data - Updated fields
 */
export async function updateTransaction(boardId, txId, data) {
  const ref = doc(db, 'boards', boardId, 'transactions', txId);
  return updateDoc(ref, data);
}

/**
 * Delete a transaction.
 * @param {string} boardId
 * @param {string} txId
 */
export async function deleteTransaction(boardId, txId) {
  const ref = doc(db, 'boards', boardId, 'transactions', txId);
  return deleteDoc(ref);
}

export async function getTransactionsForBoard(boardId) {
  const q = query(txRef(boardId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Compute the grand total of all transaction amounts for a board (one-shot read).
 * @param {string} boardId
 * @returns {Promise<number>}
 */
export async function getBoardTotal(boardId) {
  const snap = await getDocs(txRef(boardId));
  let total = 0;
  snap.docs.forEach((d) => {
    total += Number(d.data().amount) || 0;
  });
  return total;
}

/**
 * Move transaction between boards via secure callable function.
 */
export async function moveTransaction(sourceBoardId, destinationBoardId, transactionId) {
  const fn = httpsCallable(functions, 'moveTransaction');
  try {
    const result = await fn({ sourceBoardId, destinationBoardId, transactionId });
    return result.data;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'functions/unauthenticated') throw new Error('עליך להתחבר מחדש כדי להעביר עסקה.');
    if (code === 'functions/permission-denied') throw new Error('אין לך הרשאה להעביר עסקה לאחד הלוחות שנבחרו.');
    if (code === 'functions/not-found') throw new Error(err?.message || 'העסקה לא נמצאה. ייתכן שהיא נמחקה או הועברה כבר.');
    if (code === 'functions/already-exists') throw new Error('כבר קיימת עסקה עם אותו מזהה בלוח היעד.');
    if (code === 'functions/failed-precondition') throw new Error(err?.message || 'לא ניתן להעביר את העסקה.');
    throw new Error('אירעה שגיאה בעת העברת העסקה. נסה שוב.');
  }
}

/**
 * Duplicate transaction to another board via secure callable function.
 */
export async function duplicateTransaction(sourceBoardId, destinationBoardIds, transactionId) {
  const fn = httpsCallable(functions, 'duplicateTransaction');
  try {
    const result = await fn({ sourceBoardId, destinationBoardIds, transactionId });
    return result.data;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'functions/unauthenticated') throw new Error('עליך להתחבר מחדש כדי לשכפל עסקה.');
    if (code === 'functions/permission-denied') throw new Error('אין לך הרשאה לשכפל עסקה לאחד הלוחות שנבחרו.');
    if (code === 'functions/not-found') throw new Error(err?.message || 'העסקה לא נמצאה. ייתכן שהיא נמחקה.');
    if (code === 'functions/failed-precondition') throw new Error(err?.message || 'לא ניתן לשכפל את העסקה.');
    throw new Error('אירעה שגיאה בעת שכפול העסקה. נסה שוב.');
  }
}
