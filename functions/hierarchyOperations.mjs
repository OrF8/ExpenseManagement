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
/** Structural/sharing writes serialize on every affected owner lock. No depth limit.
 * All reads, including deterministically ordered locks, precede transaction writes. */
export function createHierarchyOperations({ db, timestamp }) {
  const ref = id => db.collection('boards').doc(validId(id));
  const load = async (tx, id, allowDeleting = false) => {
    const snap = await tx.get(ref(id));
    if (!snap.exists) fail('not-found', 'הלוח לא נמצא');
    const b = { ...snap.data(), id: snap.id };
    if (b.deleting && !allowDeleting) fail('failed-precondition', 'הלוח בתהליך מחיקה');
    return b;
  };
  const authorize = (b, uid, owner = false) => {
    if (owner ? b.ownerUid !== uid : !b.memberUids?.includes(uid)) fail('permission-denied', 'אין הרשאה ללוח זה');
    return b;
  };
  const read = async (tx, id, uid, owner = false, allowDeleting = false) =>
    authorize(await load(tx, id, allowDeleting), uid, owner);
  const locks = async (tx, boards, extraUids = [], writeCount = 0, deletingUid = null) => {
    const ownerUids = unique([...boards.map(b => b.ownerUid), ...extraUids]).sort();
    if (writeCount + ownerUids.length > 500) fail('resource-exhausted', 'שינוי ההיררכיה גדול מדי לפעולה אטומית');
    const writes = [];
    for (const uid of ownerUids) {
      const r = db.collection('hierarchyLocks').doc(validId(uid));
      const snap = await tx.get(r);
      if (snap.data()?.deletingAccount && uid !== deletingUid) fail('failed-precondition', 'החשבון בתהליך מחיקה');
      writes.push({r, data: {...snap.data(), revision: (snap.data()?.revision ?? 0) + 1,
        ...(uid === deletingUid ? {deletingAccount: true} : {})}});
    }
    return () => writes.forEach(({r, data}) => tx.set(r, data));
  };
  // Server-only integrity traversal. Access is checked on the operation's board,
  // never on ancestors: membership flows down, so ancestors may be inaccessible.
  async function ancestors(tx, parentId, forbiddenId) {
    const visited = new Set(forbiddenId ? [forbiddenId] : []), result = [];
    let id = parentId;
    while (id != null) {
      if (visited.has(id)) fail('failed-precondition', 'לא ניתן ליצור מעגל בהיררכיית הלוחות');
      visited.add(id);
      const b = await load(tx, id);
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
          if (!b.memberUids?.includes(uid) || b.deleting) fail('permission-denied', 'Invalid hierarchy access');
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
      const directMemberUids = unique([b.ownerUid, ...(b.id === nodes[0].id && rootDirect ? rootDirect : direct(b))]);
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
        const parent = parentBoardId == null ? null : await read(tx, parentBoardId, uid);
        const path = parent ? [parent, ...await ancestors(tx, parent.parentBoardId ?? null, parent.id)] : [];
        const ownerUid = parent && direct(parent).includes(uid) ? parent.ownerUid : uid;
        const commitLocks = await locks(tx, path, [uid, ownerUid], 1);
        tx.create(r, { title: title.trim(), currency, currencyRevision: 0, moneyRevision: 0, ownerUid, parentBoardId,
          memberUids: unique([ownerUid, ...(parent?.memberUids ?? [])]), directMemberUids: [ownerUid], createdAt: timestamp() });
        commitLocks();
      });
      return { id: r.id };
    },
    async reparentBoard(uid, { boardId, parentBoardId, expectedParentBoardId }) {
      if (parentBoardId === undefined) fail('invalid-argument', 'parentBoardId required');
      await db.runTransaction(async tx => {
        const b = await load(tx, boardId);
        if (expectedParentBoardId === undefined) authorize(b, uid, true);
        else {
          if (parentBoardId !== null || b.parentBoardId !== validId(expectedParentBoardId)) {
            fail('failed-precondition', 'לוח המשנה אינו משויך ללוח-על זה');
          }
          await read(tx, expectedParentBoardId, uid, true);
        }
        const oldPath = await ancestors(tx, b.parentBoardId ?? null, boardId);
        // A parent owner controls only this immediate edge, through an explicit
        // detach request. It grants no ownership or reparenting power over the child.
        if (parentBoardId !== null) await read(tx, parentBoardId, uid, true);
        const path = await ancestors(tx, parentBoardId, boardId);
        const nodes = await subtree(tx, b, uid);
        const plans = membershipPlans(nodes, path[0]?.memberUids ?? []);
        const commitLocks = await locks(tx, [...oldPath, ...path, ...nodes], [uid], plans.length);
        // Include the edge in the root's membership write, within the write budget.
        plans[0].parentBoardId = parentBoardId;
        apply(tx, plans);
        commitLocks();
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
        const target = mode === 'remove' ? validId(memberUid) : uid;
        let inviteRef;
        if (mode === 'accept') {
          inviteRef = ref(boardId).collection('invites').doc(validId(inviteId));
          const snap = await tx.get(inviteRef), invite = snap.data();
          if (!snap.exists) fail('not-found', 'ההזמנה לא נמצאה');
          if (!email || invite.invitedEmailLower !== email) fail('permission-denied', 'אין הרשאה להזמנה');
          if (invite.expiresAt && invite.expiresAt.toMillis() <= Date.now()) fail('failed-precondition', 'פג תוקף ההזמנה');
        } else if (target === b.ownerUid) fail('invalid-argument', 'לא ניתן להסיר את בעל הלוח');
        const path = await ancestors(tx, b.parentBoardId ?? null, b.id);
        const nodes = await subtree(tx, b, b.ownerUid);
        const rootDirect = mode === 'accept' ? unique([...direct(b), target]) : direct(b).filter(v => v !== target);
        const plans = membershipPlans(nodes, path[0]?.memberUids ?? [], rootDirect);
        const commitLocks = await locks(tx, [...path, ...nodes], [uid, target], plans.length + (inviteRef ? 1 : 0));
        apply(tx, plans);
        if (inviteRef) tx.delete(inviteRef);
        commitLocks();
      });
      return {success: true};
    },
    async deleteBoard(uid, {boardId}) {
      await db.runTransaction(async tx => {
        const b = await read(tx, boardId, uid, true, true);
        const path = await ancestors(tx, b.parentBoardId ?? null, b.id);
        const children = await tx.get(db.collection('boards').where('parentBoardId', '==', boardId).limit(1));
        if (!children.empty) fail('failed-precondition', 'יש להעביר או למחוק את לוחות המשנה לפני מחיקת הלוח');
        const commitLocks = await locks(tx, [b, ...path], [uid], 1);
        tx.update(ref(boardId), {deleting: true}); commitLocks();
      });
      // A durable tombstone blocks new children and monetary writes during cleanup.
      // Keep it until subcollections are gone, so failed cleanup is retryable.
      for (const name of ['transactions', 'invites']) await db.recursiveDelete(ref(boardId).collection(name));
      await ref(boardId).delete();
      return {success: true};
    },
    // Account deletion must not orphan or delete another owner's child. Prepare
    // all affected edges, memberships and owned tombstones in one transaction.
    async prepareAccountDeletion(uid) {
      return db.runTransaction(async tx => {
        const owned = await tx.get(db.collection('boards').where('ownerUid', '==', uid));
        const shared = await tx.get(db.collection('boards').where('memberUids', 'array-contains', uid));
        const boards = [...new Map([...owned.docs, ...shared.docs]
          .map(d => [d.id, {...d.data(), id: d.id}])).values()];
        const {byId, children} = indexHierarchy(boards);
        const roots = boards.filter(b => !b.parentBoardId || !byId.has(b.parentBoardId));
        const paths = new Map();
        for (const root of roots) paths.set(root.id, await ancestors(tx, root.parentBoardId ?? null, root.id));
        const plans = [], visited = new Set(), members = new Map(), queue = [...roots];
        for (let i = 0; i < queue.length; i++) {
          const b = queue[i];
          if (visited.has(b.id)) fail('failed-precondition', 'Invalid hierarchy cycle');
          visited.add(b.id);
          if (b.ownerUid === uid) {
            plans.push({id: b.id, deleting: true});
            members.set(b.id, []);
          } else {
            if (b.deleting) fail('failed-precondition', 'הלוח בתהליך מחיקה');
            const detached = byId.get(b.parentBoardId)?.ownerUid === uid;
            const inherited = detached ? [] : members.get(b.parentBoardId) ?? paths.get(b.id)?.[0]?.memberUids ?? [];
            const directMemberUids = direct(b).filter(member => member !== uid);
            const memberUids = unique([...directMemberUids, ...inherited.filter(member => member !== uid)]);
            members.set(b.id, memberUids);
            plans.push({id: b.id, directMemberUids, memberUids, ...(detached ? {parentBoardId: null} : {})});
          }
          queue.push(...(children.get(b.id) ?? []));
        }
        if (visited.size !== boards.length) fail('failed-precondition', 'Invalid hierarchy cycle');
        if (plans.length > 450) fail('resource-exhausted', 'נדרש ניקוי שיתוף לפני מחיקת החשבון');
        const commitLocks = await locks(tx, [...boards, ...[...paths.values()].flat()], [uid], plans.length, uid);
        apply(tx, plans);
        commitLocks();
        return owned.docs.map(d => d.id);
      });
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
