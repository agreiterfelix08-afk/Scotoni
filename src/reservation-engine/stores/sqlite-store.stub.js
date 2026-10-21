// Backend adapter stub — NOT used by the prototype.
//
// How to go live with a real backend:
//  1. Run the same engine on a small Node server (e.g. Fastify/Express) with this
//     store implemented on SQLite (better-sqlite3) or Postgres.
//  2. Expose the engine methods as JSON endpoints (see docs/RESERVATIONS.md → "Backend").
//  3. In src/js/store-setup.js replace `new LocalStorageStore()` with `new HttpEngineClient(url)`
//     (the browser then calls the server instead of running the engine locally).
//
// Concurrency: transaction() maps to `BEGIN IMMEDIATE … COMMIT`, which serialises
// writers in SQLite. As a second, independent guard against double booking, every
// occupied 15-minute block of every table is a row with a UNIQUE constraint, so two
// overlapping bookings of the same table cannot both be inserted even if a bug in
// the application logic let them through.
//
// Abuse protection on the server: pass `ctx.ip` from the request (behind the proxy,
// from X-Forwarded-For) so the engine's per-IP rate limit applies; never put
// personal data in URLs or logs.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,            -- JSON
  PRIMARY KEY (collection, id)
);

-- Append-only audit log: no UPDATE/DELETE grants for the app user,
-- plus triggers as a belt-and-braces guard.
CREATE TABLE IF NOT EXISTS audit (
  id   TEXT PRIMARY KEY,
  at   TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;

-- One row per table per 15-minute block while a booking holds it.
CREATE TABLE IF NOT EXISTS table_blocks (
  table_id   TEXT NOT NULL,
  block_start TEXT NOT NULL,           -- UTC ISO, aligned to 15 min
  booking_id TEXT NOT NULL,
  UNIQUE (table_id, block_start)
);
`;

export class SqliteStore {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
    throw new Error("SqliteStore is a documented stub. Implement it on the server; see comments above.");
  }

  // Sketch of the implementation:
  //
  // transaction(fn) {
  //   const tx = this.db.transaction(() => fn(this.makeTx()));   // BEGIN IMMEDIATE
  //   return Promise.resolve(tx.immediate());
  // }
  //
  // makeTx(): get/all/put/remove/append as in memory-store.js, reading and writing
  // the `records` table, and for collection "bookings" rewriting the booking's rows
  // in `table_blocks` (delete old rows, insert new ones when the status occupies).
  // A UNIQUE violation aborts the whole transaction → the engine reports "full".
}
