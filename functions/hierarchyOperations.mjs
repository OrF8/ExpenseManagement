import { currencyDigits, currencyOf, aggregateTransactions, mergeCurrencyTotals } from './shared/money.mjs';
import { indexHierarchy } from './shared/hierarchy.mjs';
import { MoneyError } from './moneyOperations.mjs';
const fail = (code, message) => { throw new MoneyError(code, message); };
const unique = values => [...new Set(values)];
const direct = b => unique([b.ownerUid, ...(b.directMemberUids ?? b.memberUids ?? [])]);
export const validId = value => {
  if (typeof value !== 'string' || !value || value.includes('/') || value.length > 1500) fail('invalid-argument', 'Invalid board ID');
  return value;
};
/** All structural/sharing writes serialize on an owner lock. No depth limit.
 * Membership changes are atomic; unusually large mutations fail before any write. */
export function createHierarchyOperations({ db, timestamp }) {
  const ref = id => db.collection('boards').doc(validId(id));
  const read = async (tx, id, uid, owner = false, allowDeleting = false) => {
    const snap = await tx.get(ref(id));
    if (!snap.exists) fail('not-found', 'הלוח לא נמצא');
    const b = { ...snap.data(), id: snap.id };
    if (owner ? b.ownerUid !== uid : !b.memberUids?.includes(uid)) fail('permission-denied', 'אין הרשאה ללוח זה');
    if (b.deleting && !allowDeleting) fail('failed-precondition', 'הלוח בתהליך מחיקה');
    return b;
  };
  const lock = async (tx, uid) => {
    const r = db.collection('hierarchyLocks').doc(uid);
    const snap = await tx.get(r);
    if (snap.data()?.deletingAccount) fail('failed-precondition', 'החשבון בתהליך מחיקה');
    return () => tx.set(r, { revision: (snap.data()?.revision ?? 0) + 1 });
  };
  async function ancestors(tx, parentId, ownerUid, forbiddenId) {
    const visited = new Set(forbiddenId ? [forbiddenId] : []), result = [];
    let id = parentId;
    while (id != null) {
      if (visited.has(id)) fail('failed-precondition', 'לא ניתן ליצור מעגל בהיררכיית הלוחות');
      visited.add(id);
      const b = await read(tx, id, ownerUid, true);
      result.push(b); id = b.parentBoardId ?? null;
    }
    return result;
  }
  async function subtree(tx, root, uid) {
    const result = [root], visited = new Set([root.id]);
    // Query one breadth-first frontier at a time, up to Firestore's 30-value IN limit.
    let frontier = [root.id];
    while (frontier.length) {
      const next = [];
      for (let i = 0; i < frontier.length; i += 30) {
        const snap = await tx.get(db.collection('boards').where('parentBoardId', 'in', frontier.slice(i, i + 30)));
        for (const doc of snap.docs) {
          const b = { ...doc.data(), id: doc.id };
          if (visited.has(b.id)) fail('failed-precondition', 'Invalid hierarchy cycle');
          if (b.ownerUid !== root.ownerUid || !b.memberUids?.includes(uid) || b.deleting) fail('permission-denied', 'Invalid hierarchy access');
          visited.add(b.id); result.push(b); next.push(b.id);
        }
      }
      frontier = next;
    }
    return result;
  }
  function membershipPlans(nodes, inherited, rootDirect) {
    const members = new Map(), plans = [];
    for (const b of nodes) {
      const directMemberUids = b.id === nodes[0].id && rootDirect ? rootDirect : direct(b);
      const memberUids = unique([...directMemberUids, ...(b.id === nodes[0].id ? inherited : members.get(b.parentBoardId) ?? [])]);
      members.set(b.id, memberUids);
      plans.push({ id: b.id, directMemberUids, memberUids });
    }
    if (plans.length > 450) fail('resource-exhausted', 'שינוי השיתוף גדול מדי לפעולה אטומית. יש להעביר ענפים קטנים יותר תחילה.');
    return plans;
  }
  const apply = (tx, plans) => plans.forEach(({id, ...data}) => tx.update(ref(id), data));
  return {
    async listBoardRoots(uid) {
      const snap = await db.collection('boards').where('memberUids', 'array-contains', uid).get();
      const boards = snap.docs.map(d => ({...d.data(), id: d.id}));
      const ids = new Set(boards.map(b => b.id));
      const roots = boards.filter(b => !b.parentBoardId || !ids.has(b.parentBoardId));
      // Corrupt cycles remain reachable for repair instead of disappearing.
      const {children} = indexHierarchy(boards);
      const shown = new Set();
      const mark = root => {
        const queue = [root];
        for (let i = 0; i < queue.length; i++) {
          const node = queue[i];
          if (shown.has(node.id)) continue;
          shown.add(node.id);
          for (const child of children.get(node.id) ?? []) queue.push(child);
        }
      };
      roots.forEach(mark);
      for (const b of boards) if (!shown.has(b.id)) { roots.push(b); mark(b); }
      const counts = new Map();
      for (const b of boards) counts.set(b.parentBoardId, (counts.get(b.parentBoardId) ?? 0) + 1);
      return {boards: roots.map(b => ({id:b.id, title:b.title, ownerUid:b.ownerUid, memberUids:b.memberUids, parentBoardId:b.parentBoardId ?? null,
        currency:currencyOf(b), moneyRevision:b.moneyRevision ?? 0, childCount:counts.get(b.id) ?? 0, deleting:b.deleting ?? false}))};
    },
    async createBoard(uid, { title, currency = 'ILS', parentBoardId = null }) {
      if (typeof title !== 'string' || !title.trim() || title.length > 200) fail('invalid-argument', 'Invalid board title');
      currencyDigits(currency);
      const r = db.collection('boards').doc();
      await db.runTransaction(async tx => {
        const commitLock = await lock(tx, uid);
        const path = await ancestors(tx, parentBoardId, uid, r.id);
        tx.create(r, { title: title.trim(), currency, currencyRevision: 0, moneyRevision: 0, ownerUid: uid, parentBoardId,
          memberUids: unique([uid, ...(path[0]?.memberUids ?? [])]), directMemberUids: [uid], createdAt: timestamp() });
        commitLock();
      });
      return { id: r.id };
    },
    async reparentBoard(uid, { boardId, parentBoardId }) {
      if (parentBoardId === undefined) fail('invalid-argument', 'parentBoardId required');
      await db.runTransaction(async tx => {
        const b = await read(tx, boardId, uid, true);
        const commitLock = await lock(tx, uid);
        const path = await ancestors(tx, parentBoardId, uid, boardId);
        const nodes = await subtree(tx, b, uid);
        const plans = membershipPlans(nodes, path[0]?.memberUids ?? []);
        apply(tx, plans);
        tx.update(ref(boardId), { parentBoardId });
        commitLock();
      });
      return { success: true };
    },
    async changeMembership(uid, {boardId, memberUid, inviteId}, mode, email) {
      await db.runTransaction(async tx => {
        const b = await read(tx, boardId, uid, mode === 'remove', false).catch(async error => {
          // An invited user does not yet have effective access.
          if (mode !== 'accept' || error.code !== 'permission-denied') throw error;
          const snap = await tx.get(ref(boardId));
          if (snap.data()?.deleting) fail('failed-precondition', 'הלוח בתהליך מחיקה');
          return {...snap.data(), id: snap.id};
        });
        const commitLock = await lock(tx, b.ownerUid);
        const target = mode === 'remove' ? validId(memberUid) : uid;
        let inviteRef;
        if (mode === 'accept') {
          inviteRef = ref(boardId).collection('invites').doc(validId(inviteId));
          const snap = await tx.get(inviteRef), invite = snap.data();
          if (!snap.exists) fail('not-found', 'ההזמנה לא נמצאה');
          if (!email || invite.invitedEmailLower !== email) fail('permission-denied', 'אין הרשאה להזמנה');
          if (invite.expiresAt && invite.expiresAt.toMillis() <= Date.now()) fail('failed-precondition', 'פג תוקף ההזמנה');
        } else if (target === b.ownerUid) fail('invalid-argument', 'לא ניתן להסיר את בעל הלוח');
        const path = await ancestors(tx, b.parentBoardId ?? null, b.ownerUid, b.id);
        const nodes = await subtree(tx, b, b.ownerUid);
        const rootDirect = mode === 'accept' ? unique([...direct(b), target]) : direct(b).filter(v => v !== target);
        const plans = membershipPlans(nodes, path[0]?.memberUids ?? [], rootDirect);
        apply(tx, plans);
        if (inviteRef) tx.delete(inviteRef);
        commitLock();
      });
      return {success: true};
    },
    async deleteBoard(uid, {boardId}) {
      await db.runTransaction(async tx => {
        await read(tx, boardId, uid, true, true);
        const commitLock = await lock(tx, uid);
        const children = await tx.get(db.collection('boards').where('parentBoardId', '==', boardId).limit(1));
        if (!children.empty) fail('failed-precondition', 'יש להעביר או למחוק את לוחות המשנה לפני מחיקת הלוח');
        tx.update(ref(boardId), {deleting: true}); commitLock();
      });
      // A durable tombstone blocks new children and monetary writes during cleanup.
      // Keep it until subcollections are gone, so failed cleanup is retryable.
      for (const name of ['transactions', 'invites']) await db.recursiveDelete(ref(boardId).collection(name));
      await ref(boardId).delete();
      return {success: true};
    },
    async getHierarchySummary(uid, {boardId, includeTransactions = false}) {
      return db.runTransaction(async tx => {
        const root = await read(tx, boardId, uid);
        const nodes = await subtree(tx, root, uid);
        const totalsByBoard = new Map(), worksheets = [];
        for (const b of nodes) {
          const rows = await tx.get(ref(b.id).collection('transactions'));
          const transactions = rows.docs.map(d => ({...d.data(), id: d.id}));
          const currency = currencyOf(b);
          totalsByBoard.set(b.id, {[currency]: aggregateTransactions(transactions, currency).grandTotal});
          if (includeTransactions) worksheets.push({id: b.id, parentBoardId: b.parentBoardId ?? null, name: b.title, title: b.title, currency, transactions});
        }
        const directTotals = totalsByBoard.get(root.id);
        // subtree() returns parents before children. Roll up saved board-currency
        // amounts bottom-up exactly once, without converting between board currencies.
        for (let i = nodes.length - 1; i > 0; i--) {
          const b = nodes[i];
          totalsByBoard.set(b.parentBoardId, mergeCurrencyTotals([
            totalsByBoard.get(b.parentBoardId), totalsByBoard.get(b.id),
          ]));
        }
        const children = nodes.filter(b => b.parentBoardId === root.id)
          .map(b => ({id: b.id, title: b.title, totals: totalsByBoard.get(b.id)}));
        return {totals: totalsByBoard.get(root.id), directTotals, children, boardCount: nodes.length, worksheets};
      });
    },
  };
}
