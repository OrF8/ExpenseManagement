# Nested boards — 1.7.0

## Data and compatibility

`boards/{id}` remains flat. `parentBoardId: string | null` is the single authoritative
edge. Missing fields are roots. Existing one-level edges are preserved. Legacy
`subBoardIds` reverse caches are ignored and need no migration; new code never writes them.
No ancestor arrays or duplicate transactions are stored. Routes remain `/board/:id`.

Board details subscribe to their own document, immediate children, and accessible
ancestors. Ancestors stop at missing, inaccessible, cross-owner, or repeated IDs with a
neutral UI hint. The root catalog callable returns only roots/accessible entry points,
including legacy roots and malformed cycle entry points for diagnosis. It scans accessible
board metadata server-side (no transactions), refreshing on local mutations, focus, and
30-second polling. Only explicit destination selectors load all accessible board metadata.

## Integrity and authorization

Creation, movement, deletion, invite acceptance and membership removal use authenticated,
App Check-protected callables. Structural and membership operations serialize through
`hierarchyLocks/{ownerUid}` inside Firestore transactions. The lock collection has no
client rules and is inaccessible to clients. Parent validation walks the authoritative
ancestor chain iteratively with a visited set, validates existence and common ownership,
and rejects the moving board anywhere along the proposed chain. Concurrent reciprocal
moves cannot both commit. Subtree queries batch frontier IDs in groups of 30 and validate
every node's owner and effective membership. Corrupt cross-owner links fail closed.

Moves atomically recompute effective membership throughout the subtree: direct members
(including the owner) plus the new parent's effective members. Direct child membership
never exposes ancestors. Legacy missing `directMemberUids` falls back to the saved members,
as before. Direct client board writes now permit only title changes. Direct hierarchy,
membership, ownership, currency, tombstone and board-delete writes are denied.

Membership-changing operations affecting more than 450 boards fail before any write,
leaving room for metadata/lock writes and avoiding partial access changes. This is an
atomic operation size bound, not a nesting depth bound; split large moves into smaller
branches. Creation and iterative navigation have no fixed depth limit. Very large
summaries remain subject to callable/Firestore transaction time and response-size limits;
errors are shown instead of partial totals. No denormalized total cache is introduced.

## Totals and exports

Direct transactions, filters, totals, and editing retain their selected-board semantics.
Recursive summaries run in a read-only Firestore transaction for a consistent snapshot,
include the selected board and each descendant exactly once, and reuse `aggregateTransactions`
and `mergeCurrencyTotals`. Each transaction is valued in its own board's base currency
using the existing saved conversion (`boardAmount`), then totals are grouped by that
currency. A child USD total is not re-converted to a parent ILS total. This preserves the
pre-existing currency-separated parent-summary policy, BOI/Frankfurter snapshots, manual
rates, legacy ILS interpretation, and BigInt/decimal half-away-from-zero rounding.
The summary is explicitly labeled a refreshable snapshot; direct data remains live.

The scope checkbox applies to summaries and exports, not to the transaction list. Default
export contains all direct transactions as before (filters do not limit export). Enabled
scope exports all boards in the subtree, with path-labeled worksheets and summary rows.
Excel's 31-character sheet-name limit uses the existing collision suffixes; full paths
remain in the summary. Transactions are not copied into ancestors. Move/copy uses the
existing money operations and saved-target conversion rules at any destination depth.

## Deletion

Ordinary deletion rejects any board with immediate children, so there is no cascade and
no implicit orphaning. An owned leaf is tombstoned atomically under the owner lock, then
its transactions and invites are removed, and only then is the board removed. The
`deleting` state blocks attachment, edits and monetary writes. A failed cleanup retains
the tombstone and can be retried using the ordinary delete action. There is no undo of
already deleted transactions. Account deletion retains its explicit all-owned-data
semantics, serializes against hierarchy changes and never follows foreign-owned links.

## Deployment

1. Deploy Functions (including `reparentBoard`, `getHierarchySummary`, `listBoardRoots`,
   and replacement create/delete/membership handlers).
2. Deploy `firestore.indexes.json` and wait for the `boards` collection index on
   `memberUids ARRAY_CONTAINS, parentBoardId ASCENDING` to finish building.
3. Deploy tightened Firestore rules, then Hosting. Reload old clients; their legacy
   hierarchy writes will be denied by the new rules. No production data migration is needed.

The normal deployment workflow now includes Firestore indexes. For controlled rollout,
pre-deploy the index before merging. Firebase deployment may finish before index building
completes; immediate-child queries can show an index error until it is ready. This PR does
not change live resources. Rollbacks must keep the tightened rules and compatible server
handlers; do not restore insecure legacy client hierarchy writes.

## Verification

- `npm ci` and `npm --prefix functions ci` (Node 24)
- `npm test` (unit/component tests)
- `npm run lint`, `npm --prefix functions run lint`, `npm run build`
- With Firebase CLI and Java installed: `npm run test:emulators`
- `npx playwright install chromium` supplies the browser. An existing Chromium binary
  may be selected via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Integration tests use the Firestore rules emulator and actual Admin SDK transactions,
including concurrent mutation attempts. Browser tests use Auth/Firestore emulators and a
test-only callable adapter that verifies emulator ID tokens and runs production handlers.
The adapter mocks reference rates; production App Check middleware and live FX network
availability are not exercised. Screenshots are in `docs/screenshots/`.
