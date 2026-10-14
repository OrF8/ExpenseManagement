import { aggregateTransactions, currencyDigits, currencyOf, mergeCurrencyTotals } from '../../functions/shared/money.mjs';
import { indexHierarchy } from '../../functions/shared/hierarchy.mjs';
import { EXPORT_LIMITS, EXPORT_TOO_LARGE } from '../../functions/shared/exportLimits.mjs';
import { compareText, excelText, orderExportTransactions } from './excelValues.js';

const incomplete = () => { throw new Error('נתוני הייצוא חסרים או שהיררכיית הלוחות אינה תקינה. יש לרענן ולנסות שוב. לא נוצר קובץ חלקי.'); };

/** Build a deterministic preorder and roll totals up once in reverse order.
 * Paths start at the exported root; inaccessible ancestors are never requested.
 * IDs belong to boards, so equal transaction IDs in different boards are valid. */
export function prepareExcelHierarchy({ boardId, boardCount, worksheets }) {
  if (!Array.isArray(worksheets) || !worksheets.length || boardCount !== worksheets.length) incomplete();
  if (worksheets.length > EXPORT_LIMITS.boards) throw new Error(EXPORT_TOO_LARGE);
  const encoder = new TextEncoder();
  if (encoder.encode(JSON.stringify(worksheets)).length > EXPORT_LIMITS.bytes) throw new Error(EXPORT_TOO_LARGE);
  let transactionCount = 0;
  const nodes = worksheets.map(sheet => {
    if (!sheet || typeof sheet.id !== 'string' || !sheet.id || !Array.isArray(sheet.transactions)) incomplete();
    const ids = new Set();
    for (const tx of sheet.transactions) {
      if (!tx || typeof tx.id !== 'string' || !tx.id || ids.has(tx.id)) incomplete();
      ids.add(tx.id);
    }
    transactionCount += sheet.transactions.length;
    if (transactionCount > EXPORT_LIMITS.transactions) throw new Error(EXPORT_TOO_LARGE);
    const currency = currencyOf(sheet);
    currencyDigits(currency);
    const directTotal = aggregateTransactions(sheet.transactions, currency).grandTotal;
    return { ...sheet, title: String(sheet.title ?? sheet.name ?? sheet.id), currency,
      transactions: orderExportTransactions(sheet.transactions),
      directCount: sheet.transactions.length, recursiveCount: sheet.transactions.length,
      directTotal, recursiveTotals: { [currency]: directTotal } };
  });
  const { byId, children } = indexHierarchy(nodes);
  const root = byId.get(boardId);
  if (byId.size !== nodes.length || !root || byId.has(root.parentBoardId)) incomplete();
  for (const siblings of children.values()) siblings.sort((a, b) => compareText(a.title, b.title) || compareText(a.id, b.id));
  const ordered = [], stack = [{ node: root, parent: null }], visited = new Set();
  while (stack.length) {
    const { node, parent } = stack.pop();
    if (visited.has(node.id)) incomplete();
    visited.add(node.id);
    node.depth = parent ? parent.depth + 1 : 0;
    node.path = parent ? `${parent.path}/${node.title}` : node.title;
    node.tabPath = parent ? `${parent.tabPath} › ${node.title}` : node.title;
    excelText(node.path); // Reject Excel's cell limit before building longer paths.
    ordered.push(node);
    const descendants = children.get(node.id) ?? [];
    for (let i = descendants.length - 1; i >= 0; i--) stack.push({ node: descendants[i], parent: node });
  }
  if (visited.size !== nodes.length) incomplete();
  for (let i = ordered.length - 1; i > 0; i--) {
    const node = ordered[i], parent = byId.get(node.parentBoardId);
    parent.recursiveCount += node.recursiveCount;
    parent.recursiveTotals = mergeCurrencyTotals([parent.recursiveTotals, node.recursiveTotals]);
  }
  // Deep paths repeat in the summary/currency breakdown; bound that additional
  // workbook memory even when the raw transaction payload itself is small.
  let pathBytes = 0;
  for (const node of ordered) {
    const currencies = Object.keys(node.recursiveTotals).length;
    pathBytes += encoder.encode(node.path).length * (1 + (node.directCount ? 1 : 0) + (currencies > 1 ? currencies : 0));
    if (pathBytes > EXPORT_LIMITS.bytes) throw new Error(EXPORT_TOO_LARGE);
  }
  return ordered;
}
