import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup, booking, guest, testConfig, STAFF, OWNER } from "./helpers.js";
import { StubPaymentProvider } from "../src/reservation-engine/providers.js";

describe("normal booking", () => {
  test("party of 2 gets the smallest free table, confirmed, with offset times and a confirmation email", async () => {
    const { engine, sent } = setup();
    const r = await engine.createBooking(booking());
    assert.equal(r.ok, true);
    assert.equal(r.booking.status, "confirmed");
    assert.deepEqual(r.booking.tableIds, ["S1"]);
    assert.equal(r.booking.start, "2026-07-04T12:00:00+02:00");
    assert.equal(r.booking.end, "2026-07-04T13:30:00+02:00");
    assert.match(r.booking.ref, /^SC-[A-Z2-9]{6}$/);
    assert.equal(r.booking.token.length, 32);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].template, "confirmation");
    assert.match(sent[0].text, /SC-/);
  });

  test("availability lists slots and zones for the party size", async () => {
    const { engine } = setup();
    const a = await engine.getAvailability("2026-07-04", 2);
    assert.equal(a.ok, true);
    assert.deepEqual(a.slots.map((s) => s.time), ["12:00", "12:30", "13:00"]);
    assert.equal(a.slots[0].available, true);
    assert.equal(a.slots[0].zones.terrace, true);
    assert.equal(a.premium.enabled, true);
  });

  test("dwell time blocks overlapping slots but not later ones", async () => {
    const { engine } = setup();
    await engine.createBooking(booking({ party: 6, slot: "12:00" })); // S4 until 14:00
    const r = await engine.createBooking(booking({ party: 6, slot: "13:00", zone: "stube" }));
    assert.equal(r.ok, false);
    assert.equal(r.code, "full");
  });
});

describe("table packing", () => {
  test("party of 4 uses combined tables when the 4-top and 6-top are taken", async () => {
    const { engine } = setup();
    await engine.createBooking(booking({ party: 4, zone: "stube" })); // S3
    await engine.createBooking(booking({ party: 6, zone: "stube" })); // S4
    const r = await engine.createBooking(booking({ party: 4, zone: "stube" }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.booking.tableIds.sort(), ["S1", "S2"]);
  });

  test("prefers a single exact table over a combination", async () => {
    const { engine } = setup();
    const r = await engine.createBooking(booking({ party: 4, zone: "stube" }));
    assert.deepEqual(r.booking.tableIds, ["S3"]);
  });

  test("peak hours: a party of 2 does not take the 6-top", async () => {
    const { engine } = setup();
    for (let i = 0; i < 2; i++) await engine.createBooking(booking({ slot: "12:30", zone: "stube" }));
    await engine.createBooking(booking({ slot: "12:30", party: 4, zone: "stube" }));
    const peak = await engine.createBooking(booking({ slot: "12:30", zone: "stube" }));
    assert.equal(peak.ok, false);
    assert.equal(peak.detail, "peak_rule");
    // Off-peak (another day, 12:00) the same party may use it
    for (let i = 0; i < 2; i++) await engine.createBooking(booking({ date: "2026-07-05", slot: "12:00", zone: "stube" }));
    await engine.createBooking(booking({ date: "2026-07-05", slot: "12:00", party: 4, zone: "stube" }));
    const off = await engine.createBooking(booking({ date: "2026-07-05", slot: "12:00", zone: "stube" }));
    assert.deepEqual(off.booking.tableIds, ["S4"]);
  });

  test("allocateTable reports the table that would be chosen", async () => {
    const { engine } = setup();
    const r = await engine.allocateTable("2026-07-04", "12:00", 3);
    assert.equal(r.ok, true);
    assert.deepEqual(r.tableIds, ["S3"]);
    assert.equal((await engine.allocateTable("2026-03-29", "02:30", 3)).code, "invalid_slot");
  });
});

describe("waitlist", () => {
  async function fillTerrace(engine, slot = "12:00") {
    await engine.createBooking(booking({ slot, party: 4, zone: "terrace" }));
    await engine.createBooking(booking({ slot, party: 4, zone: "terrace" }));
    return engine.createBooking(booking({ slot, party: 2, zone: "terrace" }));
  }

  test("full slot offers the waitlist", async () => {
    const { engine } = setup();
    await fillTerrace(engine);
    const r = await engine.createBooking(booking({ zone: "terrace" }));
    assert.equal(r.ok, false);
    assert.equal(r.code, "full");
    assert.equal(r.waitlist, true);
    const w = await engine.joinWaitlist(booking({ zone: "terrace" }));
    assert.equal(w.ok, true);
    assert.equal(w.position, 1);
    assert.equal(w.entry.token, undefined);
    assert.equal((await engine.joinWaitlist({ ...booking({ zone: "terrace" }), guest: { name: "x" } })).code, "validation");
  });

  test("cancellation offers the table to the first compatible entry; accepting confirms it", async () => {
    const { engine, sent } = setup();
    const last = await fillTerrace(engine);
    const big = await engine.joinWaitlist(booking({ zone: "terrace", party: 4 })); // does not fit a 2-top
    const small = await engine.joinWaitlist(booking({ zone: "terrace", party: 2 }));
    assert.ok(big.ok && small.ok);
    const c = await engine.cancelBooking(last.booking.token);
    assert.equal(c.ok, true);
    assert.equal(c.offers.length, 1);
    const offerMail = sent.find((m) => m.template === "offer");
    assert.ok(offerMail);
    const day = await engine.getDay("2026-07-04", STAFF);
    const offered = day.bookings.find((b) => b.status === "offered");
    assert.deepEqual(offered.tableIds, ["T3"]);
    const acc = await engine.acceptOffer(offered.token);
    assert.equal(acc.ok, true);
    assert.equal(acc.booking.status, "confirmed");
    assert.equal((await engine.acceptOffer(offered.token)).code, "not_offered");
  });

  test("an expired offer passes to the next person", async () => {
    const { engine, clock } = setup();
    const last = await fillTerrace(engine);
    await engine.joinWaitlist(booking({ zone: "terrace" }));
    const second = await engine.joinWaitlist(booking({ zone: "terrace" }));
    await engine.cancelBooking(last.booking.token);
    let day = await engine.getDay("2026-07-04", STAFF);
    const first = day.bookings.find((b) => b.status === "offered");
    clock.advance(31);
    assert.equal((await engine.acceptOffer(first.token)).code, "offer_expired");
    day = await engine.getDay("2026-07-04", STAFF);
    const next = day.bookings.find((b) => b.status === "offered");
    assert.ok(next);
    assert.equal(next.guest.email, second.entry.guest.email);
    assert.equal(day.waitlist.find((w) => w.status === "expired").guest.email, first.guest.email);
  });

  test("waitlist rules: duplicates, capacity, leaving", async () => {
    const { engine } = setup();
    const g = guest();
    const a = await engine.joinWaitlist(booking({ guest: g }));
    assert.equal((await engine.joinWaitlist(booking({ guest: g }))).code, "duplicate_waitlist");
    await engine.joinWaitlist(booking());
    await engine.joinWaitlist(booking());
    assert.equal((await engine.joinWaitlist(booking())).code, "waitlist_full");
    const looked = await engine.getWaitlistEntry(a.token);
    assert.equal(looked.entry.status, "waiting");
    assert.equal(looked.entry.token, undefined);
    assert.equal((await engine.getWaitlistEntry("short")).code, "not_found");
    assert.equal((await engine.leaveWaitlist(a.token)).ok, true);
    assert.equal((await engine.leaveWaitlist(a.token)).code, "not_cancellable");
    assert.equal((await engine.leaveWaitlist("nope")).code, "not_found");
    assert.equal((await engine.joinWaitlist(booking({ website: "spam" }))).code, "spam");
    assert.equal((await engine.joinWaitlist(booking({ date: "2026-06-01" }))).code, "past_date");
  });

  test("promoteWaitlist can be triggered manually", async () => {
    const { engine } = setup();
    await engine.joinWaitlist(booking());
    const r = await engine.promoteWaitlist("2026-07-04", "12:00");
    assert.equal(r.offers.length, 1);
  });
});

describe("walk-in reserve", () => {
  const halfStube = () => testConfig({
    zones: testConfig().zones.map((z) => (z.id === "stube" ? { ...z, onlineShare: 0.5 } : z)),
  });

  test("online bookings stop at the online share; the rest is held for walk-ins", async () => {
    const { engine } = setup({ config: halfStube() });
    // stube: 14 seats → 7 online
    assert.ok((await engine.createBooking(booking({ zone: "stube" }))).ok); // S1 (2)
    assert.ok((await engine.createBooking(booking({ zone: "stube", party: 4 }))).ok); // S3 (4) → 6 used
    const r = await engine.createBooking(booking({ zone: "stube" }));
    assert.equal(r.ok, false);
    assert.equal(r.detail, "walk_in_reserve");
    // Walk-ins still get those seats
    const w = await engine.addWalkIn({ date: "2026-07-04", time: "12:00", party: 2 }, STAFF);
    assert.equal(w.ok, true);
    assert.equal(w.booking.status, "seated");
  });

  test("held seats are released automatically at the configured time on the day", async () => {
    const { engine, clock } = setup({ config: halfStube(), at: ["2026-07-04", "08:00"] });
    await engine.createBooking(booking({ zone: "stube" }));
    await engine.createBooking(booking({ zone: "stube", party: 4 }));
    assert.equal((await engine.createBooking(booking({ zone: "stube" }))).detail, "walk_in_reserve");
    clock.set("2026-07-04", "10:31");
    assert.equal((await engine.createBooking(booking({ zone: "stube" }))).ok, true);
  });

  test("staff can release the hold now", async () => {
    const { engine } = setup({ config: halfStube() });
    await engine.createBooking(booking({ zone: "stube" }));
    await engine.createBooking(booking({ zone: "stube", party: 4 }));
    const rel = await engine.releaseWalkInHold("2026-07-04", STAFF);
    assert.equal(rel.ok, true);
    assert.equal((await engine.createBooking(booking({ zone: "stube" }))).ok, true);
    const log = await engine.getAuditLog(OWNER);
    assert.ok(log.entries.some((e) => e.action === "walk_in_hold_released"));
  });

  test("optional overbooking buffer raises the online cap", async () => {
    const cfg = halfStube();
    cfg.overbooking = { enabled: true, percent: 30 }; // 7 → 9
    const { engine } = setup({ config: cfg });
    await engine.createBooking(booking({ zone: "stube" }));
    await engine.createBooking(booking({ zone: "stube", party: 4 }));
    assert.equal((await engine.createBooking(booking({ zone: "stube" }))).ok, true);
  });
});

describe("rain mode", () => {
  test("reduced keeps covered terrace tables and re-seats the rest indoors", async () => {
    const { engine, sent } = setup();
    const covered = await engine.createBooking(booking({ zone: "terrace", party: 4 })); // T1 (covered)
    const open4 = await engine.createBooking(booking({ zone: "terrace", party: 4 })); // T2
    const open2 = await engine.createBooking(booking({ zone: "terrace", party: 2 })); // T3
    assert.deepEqual(covered.booking.tableIds, ["T1"]);
    const r = await engine.setRainMode("2026-07-04", "reduced", STAFF);
    assert.equal(r.ok, true);
    assert.deepEqual(r.moved.map((m) => m.bookingId).sort(), [open4.booking.id, open2.booking.id].sort());
    assert.equal(r.affected.length, 0);
    const day = await engine.getDay("2026-07-04", STAFF);
    assert.equal(day.bookings.find((b) => b.id === covered.booking.id).zone, "terrace");
    assert.ok(day.bookings.filter((b) => b.id !== covered.booking.id).every((b) => b.zone === "stube"));
    assert.equal(sent.filter((m) => m.template === "rain_moved").length, 2);
    const a = await engine.getAvailability("2026-07-04", 4);
    assert.equal(a.slots[0].zones.terrace, false);
  });

  test("closed with no room indoors reports bookings that need attention", async () => {
    const { engine, sent } = setup();
    for (const p of [6, 4, 2, 2]) await engine.createBooking(booking({ zone: "stube", party: p }));
    await engine.createBooking(booking({ zone: "terrace", party: 4 }));
    const r = await engine.setRainMode("2026-07-04", "closed", STAFF);
    assert.equal(r.moved.length, 0);
    assert.equal(r.affected.length, 1);
    assert.equal(sent.filter((m) => m.template === "rain_affected").length, 1);
    const off = await engine.setRainMode("2026-07-04", "off", STAFF);
    assert.equal(off.ok, true);
    const day = await engine.getDay("2026-07-04", STAFF);
    assert.ok(day.bookings.every((b) => !b.flags.rainAffected));
    assert.equal((await engine.setRainMode("2026-07-04", "storm", STAFF)).code, "invalid_mode");
    assert.equal((await engine.setRainMode("2026-07-04", "closed")).code, "forbidden");
  });

  test("seated terrace guests are listed, not moved", async () => {
    const { engine, clock } = setup({ at: ["2026-07-04", "08:00"] });
    const b = await engine.createBooking(booking({ zone: "terrace", party: 2 }));
    clock.set("2026-07-04", "12:05");
    await engine.setStatus(b.booking.id, "seated", STAFF);
    const r = await engine.setRainMode("2026-07-04", "closed", STAFF);
    assert.equal(r.affected[0].seated, true);
  });
});

describe("DST and time zone", () => {
  test("spring-forward day: offsets switch from +01:00 to +02:00 and durations stay exact", async () => {
    const { engine } = setup({ at: ["2026-03-20", "08:00"] });
    const before = await engine.createBooking(booking({ date: "2026-03-28" }));
    const dst = await engine.createBooking(booking({ date: "2026-03-29" }));
    assert.equal(before.booking.start, "2026-03-28T12:00:00+01:00");
    assert.equal(dst.booking.start, "2026-03-29T12:00:00+02:00");
    assert.equal(Date.parse(dst.booking.end) - Date.parse(dst.booking.start), 90 * 60000);
  });

  test("a slot inside the DST gap does not exist and is skipped", async () => {
    const config = testConfig({ slots: ["02:30", "12:00"] });
    const { engine } = setup({ config, at: ["2026-03-20", "08:00"] });
    const a = await engine.getAvailability("2026-03-29", 2);
    assert.deepEqual(a.slots.map((s) => s.time), ["12:00"]);
    const r = await engine.createBooking(booking({ date: "2026-03-29", slot: "02:30" }));
    assert.equal(r.code, "validation");
    assert.equal(r.errors.slot, "invalid_slot");
  });

  test("fall-back day: ambiguous 02:30 resolves to the first occurrence", async () => {
    const config = testConfig({ slots: ["02:30", "12:00"], policy: { minLeadMinutes: 0 } });
    const { engine } = setup({ config, at: ["2026-10-20", "08:00"] });
    const r = await engine.createBooking(booking({ date: "2026-10-25", slot: "02:30" }));
    assert.equal(r.booking.start, "2026-10-25T02:30:00+02:00");
    const noon = await engine.createBooking(booking({ date: "2026-10-25", slot: "12:00" }));
    assert.equal(noon.booking.start, "2026-10-25T12:00:00+01:00");
  });

  test("'today' and the same-day cut-off follow Rome time, not UTC", async () => {
    // 23:30 UTC on 3 July is already 01:30 on 4 July in Rome
    const { engine, clock } = setup();
    clock.ms = Date.parse("2026-07-03T23:30:00Z");
    const a = await engine.getAvailability("2026-07-03", 2);
    assert.equal(a.closed, "past_date");
    clock.set("2026-07-04", "11:05");
    const late = await engine.createBooking(booking({ slot: "13:00" }));
    assert.equal(late.code, "same_day_closed");
  });
});

describe("concurrency", () => {
  test("two guests booking the last table at the same time: exactly one succeeds", async () => {
    const config = testConfig({ zones: [{ id: "stube", weatherDependent: false, onlineShare: 1, tables: [{ id: "S1", seats: 2, combinableWith: [] }] }], premium: { enabled: false } });
    const { engine } = setup({ config });
    const results = await Promise.all([engine.createBooking(booking()), engine.createBooking(booking()), engine.createBooking(booking())]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.ok(results.filter((r) => !r.ok).every((r) => r.code === "full"));
  });

  test("a move onto an occupied table is refused even for the owner", async () => {
    const { engine } = setup();
    const a = await engine.createBooking(booking({ zone: "stube" })); // S1
    await engine.createBooking(booking({ zone: "stube", party: 4 })); // S3
    const r = await engine.moveBooking(a.booking.id, ["S3"], { ...OWNER, reason: "regular" });
    assert.equal(r.code, "table_taken");
  });
});

describe("premium", () => {
  test("requires accepting the stated rule and uses only the premium area", async () => {
    const { engine, sent } = setup();
    const noRule = await engine.createBooking(booking({ premium: true, party: 4 }));
    assert.equal(noRule.errors.acceptPremiumRule, "premium_rule_required");
    const ok = await engine.createBooking(booking({ premium: true, acceptPremiumRule: true, party: 4 }));
    assert.equal(ok.booking.zone, "premium");
    assert.match(sent.at(-1).text, /minimum spend of 40 EUR per person/);
  });

  test("regular guests never get premium tables, even when everything else is full", async () => {
    const config = testConfig({ zones: testConfig().zones.filter((z) => z.id !== "terrace") });
    const { engine } = setup({ config });
    for (const p of [6, 4, 2, 2]) assert.ok((await engine.createBooking(booking({ party: p }))).ok);
    const r = await engine.createBooking(booking({ party: 2 }));
    assert.equal(r.code, "full");
    const a = await engine.getAvailability("2026-07-04", 2);
    assert.equal(a.slots[0].available, false);
    assert.equal(a.slots[0].premiumAvailable, true);
  });

  test("premium is unavailable until the hut sets the amount", async () => {
    const config = testConfig({ premium: { enabled: true, zone: "premium", model: "minimumSpend", minimumSpendPerPerson: null } });
    const { engine } = setup({ config });
    const r = await engine.createBooking(booking({ premium: true, acceptPremiumRule: true }));
    assert.equal(r.errors.premium, "premium_unavailable");
    assert.equal(engine.premiumInfo().enabled, false);
  });

  test("deposit model takes a deposit through the payment interface", async () => {
    const config = testConfig({ premium: { enabled: true, zone: "premium", model: "deposit", depositPerPerson: 20, currency: "EUR" } });
    const payments = new StubPaymentProvider();
    const { engine } = setup({ config, payments });
    const r = await engine.createBooking(booking({ premium: true, acceptPremiumRule: true, party: 3 }));
    assert.equal(r.booking.status, "confirmed");
    assert.equal(r.booking.deposit.reference, `demo_${r.booking.id}`);
    assert.equal(payments.calls[0].amountCents, 6000);
  });

  test("a deposit needing action keeps the table on hold and then expires", async () => {
    const config = testConfig({ premium: { enabled: true, zone: "premium", model: "deposit", depositPerPerson: 20, currency: "EUR" } });
    const { engine, clock } = setup({ config, payments: new StubPaymentProvider({ outcome: "requires_action" }) });
    const r = await engine.createBooking(booking({ premium: true, acceptPremiumRule: true }));
    assert.equal(r.booking.status, "pending_payment");
    assert.equal(r.payment.status, "requires_action");
    clock.advance(16);
    const again = await engine.createBooking(booking({ premium: true, acceptPremiumRule: true }));
    assert.equal(again.ok, true);
  });
});

describe("overrides and audit log", () => {
  test("staff override needs a reason and is logged with who, when, what, why", async () => {
    const { engine } = setup();
    const missing = await engine.createBooking(booking({ date: "2026-12-30" }), { ...STAFF, override: true });
    assert.equal(missing.code, "reason_required");
    const ok = await engine.createBooking(booking({ date: "2026-12-30" }), { ...STAFF, override: true, reason: "Regular guest, booked by phone" });
    assert.equal(ok.ok, true);
    assert.equal(ok.booking.countsTowardQuota, false);
    const log = await engine.getAuditLog(OWNER);
    const e = log.entries.find((x) => x.action === "booking_created");
    assert.equal(e.override, true);
    assert.equal(e.reason, "Regular guest, booked by phone");
    assert.equal(e.actor.name, "Anna");
    assert.match(e.at, /\+0[12]:00$/);
  });

  test("guests cannot override; staff cannot read the audit log", async () => {
    const { engine } = setup();
    assert.equal((await engine.createBooking(booking(), { override: true, reason: "x" })).code, "forbidden");
    assert.equal((await engine.getAuditLog(STAFF)).code, "forbidden");
  });

  test("rule-breaking moves need a reason; plain moves do not", async () => {
    const { engine } = setup();
    const b = await engine.createBooking(booking({ party: 4, zone: "stube" })); // S3
    const plain = await engine.moveBooking(b.booking.id, ["T1"], STAFF);
    assert.equal(plain.ok, true);
    assert.deepEqual(plain.violations, ["zone_change"]);
    const small = await engine.moveBooking(b.booking.id, ["S1"], STAFF);
    assert.equal(small.code, "reason_required");
    assert.deepEqual(small.violations, ["table_too_small", "zone_change"]);
    const forced = await engine.moveBooking(b.booking.id, ["S1"], { ...STAFF, reason: "Two more chairs added" });
    assert.equal(forced.ok, true);
    const prem = await engine.moveBooking(b.booking.id, ["P1"], STAFF);
    assert.equal(prem.code, "reason_required");
    assert.ok(prem.violations.includes("premium_area"));
    const log = await engine.getAuditLog(OWNER);
    const moves = log.entries.filter((e) => e.action === "booking_moved");
    assert.equal(moves.length, 2);
    assert.equal(moves.find((m) => m.override).reason, "Two more chairs added");
    assert.equal((await engine.moveBooking(b.booking.id, ["X9"], STAFF)).code, "invalid_tables");
    assert.equal((await engine.moveBooking(b.booking.id, ["S1", "T1"], STAFF)).code, "invalid_tables");
    assert.equal((await engine.moveBooking("missing", ["S1"], STAFF)).code, "not_found");
  });

  test("staff cancellation requires a reason and is logged", async () => {
    const { engine } = setup();
    const b = await engine.createBooking(booking());
    assert.equal((await engine.cancelBooking(b.booking.id, STAFF)).code, "reason_required");
    const r = await engine.cancelBooking(b.booking.id, { ...STAFF, reason: "Guest called" });
    assert.equal(r.ok, true);
    assert.equal(r.lateCancel, false);
    const log = await engine.getAuditLog(OWNER, { date: "2026-07-04" });
    assert.ok(log.entries.some((e) => e.action === "booking_cancelled" && e.reason === "Guest called"));
  });
});

describe("policy rules", () => {
  test("booking window, past dates, lead time, season and closed days", async () => {
    const { engine } = setup({ config: testConfig({ seasons: [{ from: "06-01", to: "10-15" }], closedWeekdays: [1], closedDates: ["2026-07-08"] }) });
    assert.equal((await engine.createBooking(booking({ date: "2026-06-30" }))).code, "past_date");
    assert.equal((await engine.createBooking(booking({ date: "2026-09-15" }))).code, "outside_window");
    assert.equal((await engine.createBooking(booking({ date: "2026-07-06" }))).code, "closed_day"); // Monday
    assert.equal((await engine.createBooking(booking({ date: "2026-07-08" }))).code, "closed_day");
    const closedSeason = setup({ config: testConfig({ seasons: [{ from: "12-01", to: "04-15" }] }) });
    assert.equal((await closedSeason.engine.createBooking(booking())).code, "closed_day");
    const a = await engine.getAvailability("2026-07-06", 2);
    assert.equal(a.closed, "closed_day");
    const lead = setup({ config: testConfig({ policy: { sameDayCutoff: null } }), at: ["2026-07-04", "10:00"] });
    const r = await lead.engine.getAvailability("2026-07-04", 2);
    assert.equal(r.slots[0].reason, null);
    lead.clock.set("2026-07-04", "11:05");
    const r2 = await lead.engine.getAvailability("2026-07-04", 2);
    assert.equal(r2.slots[0].reason, "too_late");
  });

  test("groups above the threshold become requests that staff confirm", async () => {
    const { engine, sent } = setup();
    const r = await engine.createBooking(booking({ party: 10 }));
    assert.equal(r.booking.status, "requested");
    assert.equal(sent.at(-1).template, "request");
    const c = await engine.setStatus(r.booking.id, "confirmed", STAFF);
    assert.equal(c.booking.status, "confirmed");
    assert.equal(sent.at(-1).template, "confirmation");
    const r2 = await engine.createBooking(booking({ party: 9, date: "2026-07-05" }));
    assert.equal((await engine.setStatus(r2.booking.id, "declined", STAFF)).code, "reason_required");
    const d = await engine.setStatus(r2.booking.id, "declined", { ...STAFF, reason: "No space for groups that day" });
    assert.equal(d.booking.status, "cancelled");
  });

  test("validation errors are returned per field", async () => {
    const { engine } = setup();
    const r = await engine.createBooking({ date: "2026-02-30", slot: "9:00", party: 0, children: -1, guest: { name: "A", email: "nope", phone: "12" }, notes: "x".repeat(501), lang: "fr", zone: "roof" });
    assert.equal(r.code, "validation");
    assert.deepEqual(Object.keys(r.errors).sort(), ["acceptPolicy", "children", "date", "email", "lang", "name", "notes", "party", "phone", "slot", "zone"].sort());
    assert.equal((await engine.createBooking(booking({ party: 17 }))).errors.party, "party_too_large");
    assert.equal((await engine.getAvailability("2026-07-04", 17)).code, "party_too_large");
    assert.equal((await engine.getAvailability("x", 2)).code, "invalid_date");
    assert.equal((await engine.getAvailability("2026-07-04", 0)).code, "invalid_party");
  });

  test("honeypot, duplicates and rate limit", async () => {
    const { engine } = setup();
    assert.equal((await engine.createBooking(booking({ website: "http://spam" }))).code, "spam");
    const g = guest();
    assert.ok((await engine.createBooking(booking({ guest: g }))).ok);
    assert.equal((await engine.createBooking(booking({ guest: g, slot: "13:00" }))).code, "duplicate_booking");
    const h = guest();
    const dates = ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-09"];
    for (const date of dates) assert.ok((await engine.createBooking(booking({ guest: h, date }))).ok);
    assert.equal((await engine.createBooking(booking({ guest: h, date: "2026-07-10" }))).code, "rate_limited");
    const ipCtx = { ip: "203.0.113.5" };
    for (let i = 0; i < 12; i++) await engine.createBooking(booking({ date: "2026-07-11", slot: ["12:00", "12:30", "13:00"][i % 3] }), ipCtx);
    assert.equal((await engine.createBooking(booking({ date: "2026-07-12" }), ipCtx)).code, "rate_limited");
  });

  test("late cancellation and no-shows lead to a deposit requirement", async () => {
    const payments = new StubPaymentProvider();
    const { engine, clock } = setup({ payments, at: ["2026-07-03", "13:00"] });
    const g = guest();
    const late = await engine.createBooking(booking({ guest: g }));
    const c = await engine.cancelBooking(late.booking.token);
    assert.equal(c.lateCancel, true);
    const ns = await engine.createBooking(booking({ guest: g, date: "2026-07-05" }));
    assert.equal(ns.booking.depositReason, null);
    assert.equal((await engine.setStatus(ns.booking.id, "no_show", STAFF)).code, "too_early");
    clock.set("2026-07-05", "12:20");
    assert.equal((await engine.setStatus(ns.booking.id, "no_show", STAFF)).ok, true);
    const list = await engine.noShowList(STAFF);
    assert.equal(list.guests[0].depositRequired, true);
    const third = await engine.createBooking(booking({ guest: g, date: "2026-07-07" }));
    assert.equal(third.booking.depositReason, "no_show_history");
    assert.equal(payments.calls[0].amountCents, 3000);
  });

  test("guest change keeps the old table if the new time is full", async () => {
    const { engine, sent } = setup();
    const mine = await engine.createBooking(booking({ zone: "terrace", party: 2 }));
    for (const p of [6, 4, 2, 2]) await engine.createBooking(booking({ slot: "13:00", party: p, zone: "stube" }));
    for (const p of [4, 4]) await engine.createBooking(booking({ slot: "13:00", party: p, zone: "terrace" }));
    const fullMove = await engine.changeBooking(mine.booking.token, { slot: "13:00", party: 4 });
    assert.equal(fullMove.code, "full");
    const ok = await engine.changeBooking(mine.booking.token, { slot: "12:30" });
    assert.equal(ok.ok, true);
    assert.equal(ok.booking.slot, "12:30");
    assert.deepEqual(ok.booking.tableIds, ["T3"]);
    assert.equal(sent.at(-1).template, "confirmation");
    assert.equal((await engine.changeBooking(mine.booking.token, { party: 0 })).code, "validation");
    assert.equal((await engine.changeBooking(mine.booking.token, { date: "2026-06-01" })).code, "past_date");
    assert.equal((await engine.changeBooking("x".repeat(32), {})).code, "not_found");
    const group = await engine.changeBooking(mine.booking.token, { date: "2026-07-06", slot: "12:00", party: 10 });
    assert.equal(group.booking.status, "requested");
    await engine.cancelBooking(mine.booking.token);
    assert.equal((await engine.changeBooking(mine.booking.token, {})).code, "not_changeable");
    assert.equal((await engine.cancelBooking(mine.booking.token)).code, "not_cancellable");
  });

  test("manage link lookup hides the token", async () => {
    const { engine } = setup();
    const b = await engine.createBooking(booking());
    const v = await engine.getBookingByToken(b.booking.token);
    assert.equal(v.ok, true);
    assert.equal(v.booking.token, undefined);
    assert.equal(v.canCancel, true);
    assert.equal((await engine.getBookingByToken("short")).code, "not_found");
    assert.equal((await engine.cancelBooking("y".repeat(32))).code, "not_found");
  });
});

describe("staff day operations", () => {
  test("walk-ins, statuses, stats, late list and CSV", async () => {
    const { engine, clock } = setup({ at: ["2026-07-04", "08:00"] });
    const b1 = await engine.createBooking(booking({ party: 3, guest: guest({ name: "=HYPERLINK(evil)" }), notes: "Birthday, cake" }));
    const b2 = await engine.createBooking(booking({ party: 2, premium: true, acceptPremiumRule: true }));
    clock.set("2026-07-04", "12:20");
    const w = await engine.addWalkIn({ party: 5 }, STAFF);
    assert.equal(w.ok, true);
    assert.equal(w.booking.slot, "12:20");
    const pinned = await engine.addWalkIn({ party: 2, tableIds: ["T3"], name: "Hikers" }, STAFF);
    assert.deepEqual(pinned.booking.tableIds, ["T3"]);
    assert.equal((await engine.addWalkIn({ party: 4, tableIds: ["T3"] }, STAFF)).code, "full");
    assert.equal((await engine.addWalkIn({ party: 6, tableIds: ["T2"] }, STAFF)).code, "table_too_small");
    assert.equal((await engine.addWalkIn({ party: 2, tableIds: ["T2", "S1"] }, STAFF)).code, "invalid_tables");
    assert.equal((await engine.addWalkIn({ party: 0 }, STAFF)).code, "validation");
    assert.equal((await engine.addWalkIn({ party: 2, time: "25:00" }, STAFF)).code, "validation");
    assert.equal((await engine.addWalkIn({ party: 2 })).code, "forbidden");

    let day = await engine.getDay("2026-07-04", STAFF);
    assert.deepEqual(day.late.sort(), [b1.booking.id, b2.booking.id].sort());
    assert.equal((await engine.setStatus(b1.booking.id, "seated", STAFF)).ok, true);
    assert.equal((await engine.setStatus(b1.booking.id, "finished", STAFF)).ok, true);
    assert.equal((await engine.setStatus(b1.booking.id, "seated", STAFF)).code, "invalid_transition");
    assert.equal((await engine.setStatus(b1.booking.id, "teleported", STAFF)).code, "invalid_status");
    assert.equal((await engine.setStatus("nope", "seated", STAFF)).code, "not_found");
    await engine.setStatus(b2.booking.id, "no_show", STAFF);

    day = await engine.getDay("2026-07-04", STAFF);
    assert.equal(day.stats.covers, 3 + 5 + 2);
    assert.equal(day.stats.walkIns, 2);
    assert.equal(day.stats.noShows, 1);
    assert.equal(day.quota.length, 3);
    const q = await engine.quotaAt("2026-07-04", "12:00", STAFF);
    assert.equal(q.zones.find((z) => z.zone === "stube").cap, 14);

    assert.equal((await engine.exportCSV("2026-07-04", STAFF)).code, "forbidden");
    const csv = await engine.exportCSV("2026-07-04", OWNER);
    assert.match(csv.csv, /^ref,date,time/);
    assert.match(csv.csv, /'=HYPERLINK\(evil\)/);
    assert.match(csv.csv, /"Birthday, cake"/);
  });

  test("blocking tables and closing zones", async () => {
    const { engine } = setup();
    const b = await engine.createBooking(booking({ zone: "terrace", party: 2 })); // T3
    assert.equal((await engine.blockTable("2026-07-04", "T3", STAFF)).code, "reason_required");
    const busy = await engine.blockTable("2026-07-04", "T3", { ...STAFF, reason: "Broken bench" });
    assert.equal(busy.code, "table_has_bookings");
    assert.equal((await engine.blockTable("2026-07-04", "T2", { ...STAFF, reason: "Broken bench" })).ok, true);
    assert.equal((await engine.allocateTable("2026-07-04", "12:00", 4, { zone: "terrace" })).tableIds[0], "T1");
    await engine.blockTable("2026-07-04", "T1", { ...STAFF, reason: "Reserved for staff lunch" });
    assert.equal((await engine.allocateTable("2026-07-04", "12:00", 4, { zone: "terrace" })).code, "full");
    assert.equal((await engine.blockTable("2026-07-04", "T1", STAFF, { unblock: true })).ok, true);
    assert.equal((await engine.blockTable("2026-07-04", "X1", STAFF)).code, "invalid_tables");
    assert.equal((await engine.moveBooking(b.booking.id, ["T2"], STAFF)).code, "table_unavailable");

    assert.equal((await engine.closeZone("2026-07-04", "terrace", true, STAFF)).code, "reason_required");
    const closed = await engine.closeZone("2026-07-04", "terrace", true, { ...STAFF, reason: "Wind" });
    assert.equal(closed.affected.length, 1);
    assert.equal((await engine.getAvailability("2026-07-04", 2)).slots[0].zones.terrace, false);
    assert.equal((await engine.closeZone("2026-07-04", "terrace", false, { ...STAFF, reason: "Calm again" })).ok, true);
    assert.equal((await engine.closeZone("2026-07-04", "roof", true, { ...STAFF, reason: "x" })).code, "invalid_zone");
  });
});

describe("GDPR", () => {
  test("retention purge anonymises old bookings but keeps the numbers", async () => {
    const { engine, clock } = setup({ at: ["2026-07-01", "08:00"] });
    const g = guest();
    const b = await engine.createBooking(booking({ guest: g }));
    await engine.joinWaitlist(booking({ slot: "13:00" }));
    clock.set("2027-08-01", "08:00");
    assert.equal((await engine.purgeExpired(STAFF)).code, "forbidden");
    const r = await engine.purgeExpired();
    assert.equal(r.bookings, 1);
    assert.equal(r.waitlist, 1);
    assert.equal(r.guests, 1);
    const day = await engine.getDay("2026-07-04", STAFF);
    const anon = day.bookings.find((x) => x.id === b.booking.id);
    assert.equal(anon.guest, null);
    assert.equal(anon.anonymised, true);
    assert.equal(anon.party, 2);
    assert.equal(day.outbox.length, 0);
  });

  test("delete on request cancels future bookings and removes personal data", async () => {
    const { engine } = setup();
    const g = guest();
    await engine.createBooking(booking({ guest: g }));
    await engine.joinWaitlist(booking({ guest: g, date: "2026-07-05" }));
    assert.equal((await engine.deleteGuestData(g.email, STAFF)).code, "forbidden");
    assert.equal((await engine.deleteGuestData("not-an-email", OWNER)).code, "invalid_email");
    const r = await engine.deleteGuestData(g.email.toUpperCase(), OWNER);
    assert.equal(r.count, 2);
    const day = await engine.getDay("2026-07-04", STAFF);
    assert.equal(day.bookings[0].status, "cancelled");
    assert.equal(day.bookings[0].guest, null);
    const log = await engine.getAuditLog(OWNER);
    const entry = log.entries.find((e) => e.action === "guest_data_deleted");
    assert.ok(!JSON.stringify(entry).includes(g.email));
  });
});
