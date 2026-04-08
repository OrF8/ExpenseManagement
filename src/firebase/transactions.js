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
import { db } from './config';

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
