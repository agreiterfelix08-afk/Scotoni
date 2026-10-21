import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/reservation-engine/stores/memory-store.js";
import { LocalStorageStore } from "../src/reservation-engine/stores/local-storage-store.js";
import { SqliteStore, SCHEMA } from "../src/reservation-engine/stores/sqlite-store.stub.js";
import { toICS } from "../src/reservation-engine/ics.js";
import { renderTemplate, TEMPLATE_NAMES } from "../src/reservation-engine/templates.js";
import { ConsoleNotifier, StubPaymentProvider } from "../src/reservation-engine/providers.js";
import {
  addDays, addMonths, inSeason, isValidDate, isValidTime, toZonedISO, tzOffsetMinutes, weekday, zonedToUtcMs,
} from "../src/reservation-engine/time.js";
import { tableOptions, activeTables, onlineCap } from "../src/reservation-engine/allocator.js";
import { engineConfig, reservations, hut } from "../src/data/hut.config.js";
import { createEngine } from "../src/reservation-engine/engine.js";

describe("time", () => {
  test("Rome offsets around both DST switches in 2026", () => {
    assert.equal(tzOffsetMinutes(Date.parse("2026-03-29T00:59:00Z"), "Europe/Rome"), 60);
    assert.equal(tzOffsetMinutes(Date.parse("2026-03-29T01:00:00Z"), "Europe/Rome"), 120);
    assert.equal(tzOffsetMinutes(Date.parse("2026-10-25T00:59:00Z"), "Europe/Rome"), 120);
    assert.equal(tzOffsetMinutes(Date.parse("2026-10-25T01:00:00Z"), "Europe/Rome"), 60);
  });

  test("wall time conversions", () => {
    assert.equal(zonedToUtcMs("2026-03-29", "02:30", "Europe/Rome"), null);
    assert.equal(toZonedISO(zonedToUtcMs("2026-10-25", "02:30", "Europe/Rome"), "Europe/Rome"), "2026-10-25T02:30:00+02:00");
    assert.equal(toZonedISO(Date.parse("2026-01-15T11:00:00Z"), "Europe/Rome"), "2026-01-15T12:00:00+01:00");
    assert.equal(toZonedISO(Date.parse("2026-01-15T11:00:00Z"), "America/New_York"), "2026-01-15T06:00:00-05:00");
  });

  test("calendar helpers", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
    assert.equal(weekday("2026-07-04"), 6);
    assert.equal(isValidDate("2026-02-29"), false);
    assert.equal(isValidDate(20260101), false);
    assert.equal(isValidTime("24:00"), false);
    assert.equal(inSeason("2026-01-10", [{ from: "12-01", to: "04-15" }]), true);
    assert.equal(inSeason("2026-07-10", [{ from: "12-01", to: "04-15" }]), false);
    assert.equal(inSeason("2026-07-10", null), true);
  });
});

describe("allocator helpers", () => {
  test("table combinations follow combinableWith and the max size", () => {
    const tables = [
      { id: "A", seats: 2, combinableWith: ["B"] },
      { id: "B", seats: 2, combinableWith: ["A", "C"] },
      { id: "C", seats: 2, combinableWith: ["B"] },
    ];
    const keys = tableOptions(tables, 2).map((o) => o.map((t) => t.id).sort().join("+"));
    assert.deepEqual(keys.sort(), ["A", "A+B", "B", "B+C", "C"]);
    assert.equal(tableOptions(tables, 3).length, 6);
  });

  test("onlineCap and active tables", () => {
    const zone = { id: "t", weatherDependent: true, onlineShare: 0.5, tables: [{ id: "x", seats: 4, covered: true }, { id: "y", seats: 4 }] };
    assert.equal(activeTables(zone, { rain: "reduced" }).length, 1);
    assert.equal(activeTables(zone, { closedZones: ["t"] }).length, 0);
    assert.equal(onlineCap({}, zone, zone.tables, false), 4);
    assert.equal(onlineCap({}, zone, zone.tables, true), 8);
  });
});

describe("stores", () => {
  test("MemoryStore rolls back a failed transaction and keeps audit append-only", async () => {
    const s = new MemoryStore();
    await s.transaction((tx) => tx.put("bookings", { id: "1", v: 1 }));
    await assert.rejects(s.transaction((tx) => { tx.put("bookings", { id: "1", v: 2 }); throw new Error("boom"); }));
    assert.equal(s.snapshot().bookings["1"].v, 1);
    await s.transaction((tx) => tx.append("audit", { id: "a1" }));
    await assert.rejects(s.transaction((tx) => tx.put("audit", { id: "a1" })), /append-only/);
    await assert.rejects(s.transaction((tx) => tx.remove("audit", "a1")), /append-only/);
    await assert.rejects(s.transaction((tx) => tx.append("audit", { id: "a1" })), /duplicate/);
    await assert.rejects(s.transaction((tx) => tx.put("bookings", {})), /id required/);
    await assert.rejects(s.transaction((tx) => tx.append("audit", {})), /id required/);
    await s.transaction((tx) => tx.remove("bookings", "1"));
    assert.equal(s.snapshot().bookings["1"], undefined);
    assert.deepEqual(await s.transaction((tx) => tx.all("custom")), []);
  });

  test("LocalStorageStore persists, serialises, survives broken storage and resets", async () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
    let lockCalls = 0;
    const locks = { request: (name, fn) => { lockCalls++; return fn(); } };
    const s = new LocalStorageStore({ key: "k", storage, locks });
    await Promise.all([1, 2, 3].map((i) => s.transaction((tx) => tx.put("bookings", { id: String(i) }))));
    assert.equal(Object.keys(JSON.parse(data.get("k")).bookings).length, 3);
    assert.equal(lockCalls, 3);
    await s.reset();
    assert.deepEqual(JSON.parse(data.get("k")).bookings, {});

    const broken = new LocalStorageStore({ key: "k", storage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } }, locks: null });
    await broken.transaction((tx) => tx.put("bookings", { id: "x" }));
    assert.equal(await broken.transaction((tx) => tx.all("bookings").length), 1);
    const unsub = s.subscribe(() => {});
    unsub();
  });

  test("the SQLite adapter is a documented stub with a unique constraint", () => {
    assert.match(SCHEMA, /UNIQUE \(table_id, block_start\)/);
    assert.throws(() => new SqliteStore({}), /stub/);
  });
});

describe("ics, templates, providers", () => {
  test("ICS has UTC times, escaping and folding", () => {
    const ics = toICS({ uid: "b1@scotoni", start: "2026-07-04T12:00:00+02:00", end: "2026-07-04T13:30:00+02:00", title: "Lunch; Rifugio Scotoni", description: "Line1\nLine2 " + "x".repeat(80), location: "Alpe Lagazuoi 2, San Cassiano", geo: { lat: 46.5531, lon: 11.9984 }, nowMs: 0 });
    assert.match(ics, /DTSTART:20260704T100000Z/);
    assert.match(ics, /SUMMARY:Lunch\\; Rifugio Scotoni/);
    assert.match(ics, /\r\n /);
    assert.match(ics, /GEO:46.5531;11.9984/);
    assert.ok(toICS({ uid: "u", start: "2026-07-04T12:00:00+02:00", end: "2026-07-04T13:00:00+02:00", title: "t" }).includes("END:VCALENDAR"));
  });

  test("every template renders in every language", () => {
    for (const lang of ["it", "de", "en", "xx"]) {
      for (const t of TEMPLATE_NAMES) {
        const m = renderTemplate(t, lang, { tz: "Europe/Rome", hutName: "Rifugio Scotoni", ref: "SC-ABC", name: "Ada", party: 2, zone: "stube", start: "2026-07-04T12:00:00+02:00", expiresAt: "2026-07-04T10:00:00+02:00", manageUrl: "u", offerUrl: "o", holdMinutes: 15, freeCancellationHours: 24, premium: { model: t === "offer" ? "deposit" : "minimumSpend", amountPerPerson: 40, currency: "EUR" } });
        assert.ok(m.subject.length > 5 && m.text.includes("Ada"), `${t}/${lang}`);
        assert.ok(!/undefined/.test(m.text), `${t}/${lang} has undefined`);
      }
    }
  });

  test("console notifier and payment stub", async () => {
    const logs = [];
    await new ConsoleNotifier({ log: (s) => logs.push(s) }).send({ to: "a@b.it", template: "x", subject: "s", text: "t" });
    assert.match(logs[0], /a@b.it/);
    const p = new StubPaymentProvider();
    await p.refundDeposit({ reference: "r" });
    assert.equal(p.calls.length, 0);
  });
});

describe("hut config", () => {
  test("the shipped config is consistent", async () => {
    const cfg = engineConfig();
    const ids = cfg.zones.flatMap((z) => z.tables.map((t) => t.id));
    assert.equal(new Set(ids).size, ids.length, "table ids are unique");
    for (const z of cfg.zones) for (const t of z.tables) for (const c of t.combinableWith || []) {
      assert.ok(z.tables.some((x) => x.id === c), `${t.id} combines with a table in its own zone`);
    }
    assert.ok(cfg.slots.every(isValidTime));
    assert.equal(cfg.premium.isDemoValue, true, "demo fallback is labelled");
    assert.equal(engineConfig({ ...reservations, demo: false }, hut).premium.minimumSpendPerPerson, null, "no invented price outside demo mode");
    const deposit = engineConfig({ ...reservations, premium: { ...reservations.premium, model: "deposit" } }, hut);
    assert.equal(deposit.premium.depositPerPerson, reservations.demoFallbacks.depositPerPerson);
    const engine = createEngine({ config: cfg, store: new MemoryStore(), clock: () => Date.parse("2026-07-01T06:00:00Z") });
    const a = await engine.getAvailability("2026-07-04", 2);
    assert.equal(a.ok, true);
  });
});
