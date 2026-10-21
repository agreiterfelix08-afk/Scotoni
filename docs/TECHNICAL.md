# Technical guide

## Project layout

```
src/
  data/hut.config.js        ← the single file the hut edits (facts, features, reservation rules)
  data/{menu,trail,gallery,wines}.js
  i18n/{it,de,en}.js        ← all interface text; identical keys (lint-enforced)
  pages/*.html              ← page templates   partials/*.html ← header, footer, landscape
  styles/main.css, admin.css
  js/                       ← browser modules, loaded per page via data-module
  features/ega-scotoni/     ← self-contained optional feature
  reservation-engine/       ← DOM-free booking logic (+ stores, providers)
scripts/build.mjs           ← pre-renders it/ de/ en/, sitemap, robots, sw.js
scripts/lint.mjs            ← dependency-free checks
test/                       ← node:test suites for the engine
it/ de/ en/ index.html …    ← BUILD OUTPUT, committed so GitHub Pages serves it directly
```

No runtime or build dependencies: Node ≥ 22 for the build and tests, and nothing at all in the
browser beyond the site's own files. Each dependency we did *not* add is one less thing to update.

## Commands

| | |
|---|---|
| `npm run build` | regenerate the pages after any change in `src/` |
| `npm run lint` | syntax, i18n parity, built-HTML checks, safety rules |
| `npm test` | engine tests with coverage thresholds (lines ≥ 90 %) |
| `npm run check` | all three |
| `npm run serve` | local server on http://localhost:8000 |

CI (`.github/workflows/check.yml`) runs `npm run check` and fails if the committed build output
is out of date.

## Internationalisation

Pages are pre-rendered per language, so every language has its own URL, correct `hreflang`/canonical
tags, and works without JavaScript. Root `/` sends visitors to the language they chose before
(`localStorage`) or their browser language, default Italian. To add Ladin: add `src/i18n/lld.js`
with the same keys, add `"lld"` to `site.languages`, and add the locale in `scripts/build.mjs`
and `src/js/i18n.js`.

## Reservation engine

`src/reservation-engine/engine.js` exposes `createEngine({ config, store, clock, notifier, payments, links })`
with `getAvailability`, `createBooking`, `cancelBooking`, `changeBooking`, `allocateTable`,
`joinWaitlist`, `promoteWaitlist`, `acceptOffer`, the staff operations (`setRainMode`,
`releaseWalkInHold`, `addWalkIn`, `blockTable`, `closeZone`, `moveBooking`, `setStatus`),
reports (`getDay`, `getAuditLog`, `noShowList`, `exportCSV`) and GDPR (`purgeExpired`, `deleteGuestData`).
Every method returns `{ ok: true, … }` or `{ ok: false, code, … }`. It never touches the DOM
(lint-enforced), so it runs unchanged in the browser or on a server.

- **Time:** everything is computed in `Europe/Rome`. Stored times are ISO strings with offset.
  Times that don't exist on the spring DST day are rejected; ambiguous autumn times take the first
  occurrence.
- **Concurrency:** all reads and writes happen inside `store.transaction()`, which is exclusive and
  all-or-nothing. The engine re-checks availability inside the transaction, so two guests booking
  the last table never both succeed (tested). `LocalStorageStore` also takes a cross-tab Web Lock.
- **Audit log:** append-only collection (`put`/`remove` throw). Overrides without a reason are rejected.
- **Notifications:** messages are written to the `outbox` collection *inside* the transaction, then
  handed to the notifier. On a server, a worker can retry from the outbox.

## Backend

Going live means running the same engine on a server:

1. Implement `SqliteStore` (`src/reservation-engine/stores/sqlite-store.stub.js` has the schema and
   the sketch: `BEGIN IMMEDIATE` transactions plus a `UNIQUE (table_id, block_start)` table as a
   second guard against double booking).
2. Expose each engine method as `POST /<method>` (see `remote-engine.stub.js`). The server sets
   `ctx.actor` from the staff login session and `ctx.ip` from the request. The browser never
   chooses its own role.
3. In `src/js/engine-setup.js` replace the `engine` export with `createRemoteEngine(url)`.
   That is the one-line swap.
4. Replace `ConsoleNotifier` with an email provider (templates in IT/DE/EN are in `templates.js`),
   and, only if deposits are used, `StubPaymentProvider` with a payment adapter.
5. Schedule `purgeExpired()` daily, set `reservations.demo = false`, and remove `demoPins`.

Personal data never goes into URLs: manage/offer links carry only a random token in the URL
fragment, which browsers do not send to servers.
