# Multi-currency — 1.6.0

## Values and invariants

A transaction's original `amount` and `currency` are its historical source of truth.
Each board has one `currency`. New/monetarily edited transactions use decimal-string
`amount`, ISO currency code, and `moneyVersion: 1`. A same-currency transaction has
`conversion: null`; a foreign transaction stores:

```json
{
  "amount": "10.00",
  "currency": "EUR",
  "moneyVersion": 1,
  "conversion": {
    "targetCurrency": "RSD",
    "rate": "117.123456789012345678",
    "convertedAmount": "1171.23",
    "rateDate": "2026-10-01",
    "source": "automatic",
    "provider": "frankfurter"
  }
}
```

`functions/shared/money.mjs` is imported by both browser and backend. BigInt minor
units handle addition/comparison; conversion multiplies exact decimal integers and
quantizes **once, half away from zero**, into the target currency's minor units.
Conversions always start with the original amount, including after board changes.
No monetary sums or conversions use binary floating-point arithmetic. Formatting
uses `Intl.NumberFormat` with exact decimal strings and ISO codes, including on
currencies with ambiguous symbols. Modern browsers with exact decimal-string Intl
formatting are required.

`functions/shared/currencies.json` is the single checked-in currency metadata source:
ISO-style names/precision captured from Node 24's ICU/CLDR currency data, with explicit
four-decimal CLF/UYW precision. It includes 0-, 2-, 3-, and 4-decimal currencies.
Precious metals and cryptocurrencies are excluded. This catalog is deliberately
versioned, not fetched live during reads; update it when ISO/CLDR changes. Currency
recognition does not guarantee an automatic provider quote for every pair.

New original amounts must be nonzero and strictly between -100,000,000 and
100,000,000, with no more decimal places than their currency. Rates are positive,
less than 1,000,000,000,000, and accept up to 18 fractional digits. Converted amounts
may exceed the original-amount range and remain exact strings. Refunds are negative;
a conversion can round to zero. Malformed input is rejected before any write.

## Legacy compatibility

Missing board or transaction currency means **ILS** independently. Reads perform
no migration and write nothing. Legacy numeric amounts are interpreted from their
decimal serialization (including exponent notation); displayed/aggregated values
are quantized to currency precision. Unrelated edits, moves, copies and board
currency changes retain the stored original numeric value. An intentional amount
or original-currency change writes canonical monetary fields. No production-wide
bulk migration is required. Legacy transactions acquire conversion snapshots only
when an operation needs them.

## Saved rates, manual overrides and failure behavior

The backend `fx.mjs` adapter requests Frankfurter v2 CSV:
`https://api.frankfurter.dev/v2/rates.csv?base=EUR&quotes=RSD`.
CSV preserves decimal digits. Pair, header, row count, actual calendar date, rate
and response size (4 KiB) are validated; requests have a 10-second timeout and reject
redirects. Provider credentials are unnecessary. Documentation: <https://frankfurter.dev/>.

Automatic conversion uses the **latest available reference rate when saved**, not
the transaction-date historical rate. `transactionDate` describes the expense;
`conversion.rateDate` is the provider's observation date. A reload, display, date
change, merchant change or other non-monetary edit never fetches a fresh rate.
An automatic amount change obtains a new automatic snapshot. Explicit **Refresh
automatic rate** marks the form for a fresh snapshot on Save; it does not update a
saved record until that save succeeds.

Manual overrides store `source: "manual"`, `provider: null`, `rateDate: null`.
The rate direction is target units per one original unit. Manual rates survive
reloads and unrelated edits; amount changes reuse the same manual rate. Changing
original currency requires a new pair/rate. Selecting automatic refresh switches
back to automatic on successful Save. A provider failure leaves the old document
unchanged, keeps the form open, and lets the user retry or enter a manual rate.

The app's prominent board total uses original same-currency values plus saved
foreign board values. It never fetches live rates. Original currencies remain
primary on transaction cards; converted values/manual indicators are secondary.
Search, date, payment-method and amount filters feed the same aggregation helper.
Amount-range filters explicitly compare values **in the board currency**. Missing
or inconsistent snapshots show an error instead of a misleading partial total.

## Board changes, hierarchy, moves and copies

Only the owner can change the board currency. Confirmation explicitly warns that
all conversions, including manual rates for the old target, will be replaced.
A Firestore transaction reads the board and at most 401 transactions, validates
revision and authorization, resolves every rate, then updates snapshots and the
board together. **At most 400 transactions** are supported; 401 fails without
modifying anything. Same-currency snapshots are removed. Child boards are untouched.
All required provider calls complete before mutations; repeated pairs share a
request-scoped promise cache. Transaction retries recheck permissions/revisions.

`currencyRevision` changes on a board currency change. Editors submit the revision
captured when opened; stale editors fail explicitly. Each transaction has a
`revision`, checked on edits/moves/copies and advanced on revaluation. All transaction
mutations increment board `moneyRevision` inside the same Firestore transaction,
serializing collection changes with board revaluation. Board-card totals listen to
board changes and verify matching revisions around their reads. During a refresh,
unavailable totals are withheld rather than summed as zero.

Children retain independent currencies; newly created children default to their
parent's currency but can choose another. Parent rollups preserve the existing
child-board scope and show separate subtotals by currency. There is no synthetic
mixed-currency parent grand total. A parent currency change does not revalue children.

Move and multi-destination copy (up to the existing 50 destinations) preserve
original monetary fields. A valid snapshot with the same destination target is
reused, including a manual rate. Different targets receive new automatic snapshots
from originals; same-original-currency targets need no snapshot. Every destination
is authorized and every required conversion resolves before any writes. A failed
quote aborts the entire operation. Currently these operations cannot accept a new
manual destination-specific rate; users can retry when reference rates are available.

## Backend and security

Authenticated, App Check-protected callables handle `createBoard`,
`saveTransaction`, `deleteTransaction`, `changeBoardCurrency`, `moveTransaction`,
and `duplicateTransaction`. The server reads membership/ownership from Firestore.
Members can create/edit/delete/move/copy transactions; only owners change currencies.
Existing hierarchy and invitation access behavior remains in place.

Transaction writes use a whitelist of editable fields; clients cannot submit
conversion snapshots, converted amounts, timestamps, revisions or ownership data.
The backend validates decimal strings, recognized currency, limits, positive rates,
non-monetary fields and conversion metadata. All snapshots are generated server-side.
Firestore rules deny all direct client transaction mutations and board creation,
and protect board currency/revision fields on otherwise authorized owner updates.
They continue to enforce membership on reads. The frontend calls secure functions
rather than writing protected money fields directly.

## Excel

Each worksheet includes original amount/currency, board amount/currency, exact FX
rate, observation date, source and provider alongside the existing transaction
columns. Monetary values and rates are **typed text cells** so Excel's 15-digit
numeric precision cannot corrupt them. Summary positive/negative/net values are
exact text with an explicit per-board currency. Mixed currencies stay separated.
User-text formula escaping, dates, RTL layout, metadata and footer are retained.

## Deployment

Deploy functions, rules and frontend together using the existing deployment workflow.
The functions directory contains the shared modules, so Firebase's functions upload
includes them; Vite imports that same source for the browser build. Node 24 is required.
No provider secret, API key, production resource change or bulk migration is needed.
Older clients cannot write once the new rules are deployed: refresh them after the
coordinated release. New clients need the new callables to be deployed successfully.
Do not roll back only one layer after users have saved new monetary objects.

## Verification

The repository previously had lint/build but no automated unit or browser tests.
The following deterministic test commands are now provided:

```sh
npm ci
npm --prefix functions ci
npm test
npm --prefix functions test
npm run lint
npm --prefix functions run lint
npm run typecheck:money
npm run build
```

`typecheck:money` uses strict TypeScript checkJs for the shared money, conversion
planner and provider adapter; the rest of the existing JSX application is linted
and built, not claimed to have whole-application strict types.

With Node 24, Java 17+ (for the pinned Firebase CLI below) and Playwright Chromium:

```sh
npx playwright install chromium
npx --yes firebase-tools@13.35.1 emulators:exec --only auth,firestore --project demo-expense-currency --config firebase.test.json "npm run test:integration && npm run test:e2e"
```

Tests cover exact totals/rounding/precision, snapshot stability, manual overrides,
refresh failures, atomic board changes, competing revisions, 400/401 limits,
legacy preservation, moves/copies, membership/rules, filters, hierarchy and an XLSX
roundtrip. Provider outcomes are mocked; tests do not depend on live Frankfurter.
Browser tests use real Firebase Auth/Firestore demo emulators and the production
callable handlers via a test-only HTTP adapter with mocked FX. They exercise board
creation, same/foreign transactions, manual conversion, reload, filters, board
currency change, desktop and a 390px mobile viewport. **Live authentication and
App Check middleware are not exercised**. In the Work environment, the normal
Playwright Chromium download was unavailable; verification used packaged Chromium
153 via the optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` override. CI uses the
normal Playwright browser installation. Test emulator mode is restricted to Vite
DEV builds, the explicit emulator flag, and a `demo-` project ID. The adapter is
under tests and is not uploaded with functions or bundled into production.

## Current limits and future scope

- Board currency changes: maximum 400 transactions, all or nothing.
- Mixed-currency parent totals remain separate; no cross-currency parent valuation.
- Automatic rates use the latest available observation, not historical expense dates.
- No user home currency or normalized cross-board reporting yet. Explicit target
  arguments in the money layer allow a separate future reporting policy.
- Unsupported provider pairs require a manual rate when entering/editing expenses;
  board changes and transfers fail safely if required automatic rates are unavailable.
- Browser verification uses emulators; live App Check remains a deployment check.
- Historical-date lookup and normalized reporting are possible future enhancements;
  cryptocurrency, investments, live-value totals and accounting ledgers are out of scope.
