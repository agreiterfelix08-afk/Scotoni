// ReservationStore contract
// -------------------------
// Every store implements one method:
//
//   transaction(fn: (tx) => Promise<T> | T): Promise<T>
//
// `fn` runs with exclusive access: transactions never interleave, and either all
// of its writes are committed or (if it throws) none are. `tx` offers:
//
//   tx.get(collection, id)        → record | undefined
//   tx.all(collection)            → record[]
//   tx.put(collection, record)    → insert or replace by record.id
//   tx.remove(collection, id)
//   tx.append(collection, record) → insert only; the only write allowed on "audit"
//
// Collections used by the engine: bookings, waitlist, days, guests, audit, outbox, rate.
// The engine never touches storage any other way, which is what makes the
// LocalStorageStore ↔ backend swap a one-line change.

export const APPEND_ONLY = new Set(["audit"]);

export function emptyState() {
  return { bookings: {}, waitlist: {}, days: {}, guests: {}, audit: {}, outbox: {}, rate: {} };
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function makeTx(state) {
  const col = (name) => {
    if (!state[name]) state[name] = {};
    return state[name];
  };
  return {
    get: (c, id) => clone(col(c)[id]),
    all: (c) => Object.values(col(c)).map(clone),
    put(c, record) {
      if (APPEND_ONLY.has(c)) throw new Error(`${c} is append-only`);
      if (!record?.id) throw new Error("record.id required");
      col(c)[record.id] = clone(record);
    },
    remove(c, id) {
      if (APPEND_ONLY.has(c)) throw new Error(`${c} is append-only`);
      delete col(c)[id];
    },
    append(c, record) {
      if (!record?.id) throw new Error("record.id required");
      if (col(c)[record.id]) throw new Error(`duplicate id in ${c}`);
      col(c)[record.id] = clone(record);
    },
  };
}

export class MemoryStore {
  constructor(initial = emptyState()) {
    this.state = clone(initial);
    this.queue = Promise.resolve();
  }

  /** Serialised, all-or-nothing: work on a copy, swap it in only on success. */
  transaction(fn) {
    const run = this.queue.then(async () => {
      const draft = clone(this.state);
      const result = await fn(makeTx(draft));
      this.state = draft;
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  snapshot() {
    return clone(this.state);
  }
}
