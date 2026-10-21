// Offline prototype store: the whole reservation state lives in one localStorage key.
//
// Writes are serialised twice:
//  - within a tab by a promise queue (like MemoryStore);
//  - across tabs with the Web Locks API when available, so two tabs booking the
//    last table at the same moment cannot both read "free" and both write.
// State is re-read from localStorage inside the lock, never cached across transactions.

import { emptyState, makeTx } from "./memory-store.js";

export class LocalStorageStore {
  constructor({ key = "scotoni-reservations-v2", storage = globalThis.localStorage, locks = globalThis.navigator?.locks } = {}) {
    this.key = key;
    this.storage = storage;
    this.locks = locks;
    this.queue = Promise.resolve();
    this.fallback = null; // used when localStorage is unavailable (private mode)
  }

  read() {
    try {
      const raw = this.storage?.getItem(this.key);
      const state = raw ? JSON.parse(raw) : emptyState();
      return { ...emptyState(), ...state };
    } catch {
      return this.fallback ? JSON.parse(this.fallback) : emptyState();
    }
  }

  write(state) {
    const raw = JSON.stringify(state);
    try {
      this.storage.setItem(this.key, raw);
    } catch {
      this.fallback = raw;
    }
  }

  /** Run `body` exclusively: in-tab queue, plus a cross-tab Web Lock when available. */
  run(body) {
    const locked = () => (this.locks ? this.locks.request(`lock:${this.key}`, body) : body());
    const run = this.queue.then(locked);
    this.queue = run.catch(() => {});
    return run;
  }

  transaction(fn) {
    return this.run(async () => {
      const draft = this.read();
      const result = await fn(makeTx(draft));
      this.write(draft);
      return result;
    });
  }

  /** Replace all data, including the audit log. Demo reset only — never in production. */
  reset(state = emptyState()) {
    return this.run(() => this.write({ ...emptyState(), ...JSON.parse(JSON.stringify(state)) }));
  }

  /** Call `cb` when another tab changed the data. */
  subscribe(cb) {
    const handler = (e) => { if (e.key === this.key) cb(); };
    globalThis.addEventListener?.("storage", handler);
    return () => globalThis.removeEventListener?.("storage", handler);
  }
}
