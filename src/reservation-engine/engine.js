// Reservation engine — the rules of the hut, with no DOM and no storage details.
// The same module runs in the offline browser prototype and, unchanged, on a server.
//
// Every public method returns a result object:
//   { ok: true, ... }                      on success
//   { ok: false, code, errors?, ... }      on a rule/validation failure
// Codes are stable identifiers; the UI translates them.

import {
  OCCUPYING, activeTables, allocateTable as allocate, dwellMinutes, occupies, onlineCap, onlineSeatsUsed, violatesPeakRule,
} from "./allocator.js";
import {
  addDays, addMonths, inSeason, isValidDate, isValidTime, parseISO, timeToMinutes, toZonedISO, weekday, zonedParts, zonedToUtcMs,
} from "./time.js";
import { cleanText, isSpam, normaliseEmail, validateBookingInput, validateGuest } from "./validation.js";
import { renderTemplate } from "./templates.js";

const RANK = { guest: 0, staff: 1, owner: 2, system: 3 };
const GUEST = { id: "guest", role: "guest" };
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBytes(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return a;
}

export function randomToken(bytes = 16) {
  return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomRef() {
  return "SC-" + Array.from(randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

const fail = (code, extra = {}) => ({ ok: false, code, ...extra });

function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {object} deps
 * @param {object} deps.config     reservations config (see src/data/hut.config.js)
 * @param {object} deps.store      ReservationStore
 * @param {() => number} [deps.clock]
 * @param {object} [deps.notifier] see providers.js
 * @param {object} [deps.payments] see providers.js
 * @param {object} [deps.links]    { manage(token), offer(token), waitlist(token) } → URL
 * @param {string} [deps.hutName]
 */
export function createEngine({ config, store, clock = () => Date.now(), notifier = null, payments = null, links = {}, hutName = "Rifugio Scotoni" }) {
  const tz = config.timezone;
  const policy = config.policy;
  const zonesById = new Map(config.zones.map((z) => [z.id, z]));
  const tableZone = new Map(config.zones.flatMap((z) => z.tables.map((t) => [t.id, z])));
  const link = (kind, token) => (links[kind] ? links[kind](token) : `#${kind}=${token}`);

  const now = () => clock();
  const today = () => zonedParts(now(), tz).date;
  const nowMinutes = () => zonedParts(now(), tz).minutesOfDay;
  const rank = (actor) => RANK[actor?.role] ?? 0;
  const actorOf = (ctx) => ctx?.actor || GUEST;
  const isStaff = (ctx) => rank(actorOf(ctx)) >= RANK.staff;
  const reasonOf = (ctx) => cleanText(ctx?.reason, 300);
  const id = (prefix) => `${prefix}_${randomToken(8)}`;

  function premiumInfo() {
    const p = config.premium || {};
    const amount = p.model === "deposit" ? p.depositPerPerson : p.minimumSpendPerPerson;
    return {
      enabled: Boolean(p.enabled && zonesById.has(p.zone) && amount != null),
      zone: p.zone,
      model: p.model,
      amountPerPerson: amount ?? null,
      currency: p.currency || "EUR",
      isDemoValue: Boolean(p.isDemoValue),
    };
  }

  function interval(date, slot, party) {
    const startMs = zonedToUtcMs(date, slot, tz);
    if (startMs == null) return null; // time does not exist on this day (DST gap)
    const endMs = startMs + dwellMinutes(config, party) * 60000;
    return { startMs, endMs, start: toZonedISO(startMs, tz), end: toZonedISO(endMs, tz) };
  }

  function dayState(tx, date) {
    return tx.get("days", date) || { id: date, rain: "off", blocked: [], closedZones: [], holdReleased: false };
  }

  function isReleased(date, ds) {
    if (ds.holdReleased) return true;
    const t = today();
    if (date < t) return true;
    return date === t && config.walkIn?.releaseAt != null && nowMinutes() >= timeToMinutes(config.walkIn.releaseAt);
  }

  const dayBookings = (tx, date) => tx.all("bookings").filter((b) => b.date === date);

  /** Date-level rules that apply to every guest equally. */
  function dateRuleError(date) {
    const t = today();
    if (date < t) return "past_date";
    if (date > addDays(t, policy.bookingWindowDays)) return "outside_window";
    if (!inSeason(date, config.seasons)) return "closed_day";
    if ((config.closedDates || []).includes(date)) return "closed_day";
    if ((config.closedWeekdays || []).includes(weekday(date))) return "closed_day";
    return null;
  }

  /** Slot-level rules (lead time, same-day cut-off). */
  function slotRuleError(date, startMs) {
    if (startMs <= now() + (policy.minLeadMinutes || 0) * 60000) return "too_late";
    if (date === today() && policy.sameDayCutoff && nowMinutes() >= timeToMinutes(policy.sameDayCutoff)) return "same_day_closed";
    return null;
  }

  function candidateZones({ premium, zone }) {
    const prem = premiumInfo();
    if (premium) return prem.enabled ? [zonesById.get(prem.zone)] : [];
    const regular = config.zones.filter((z) => z.id !== prem.zone);
    if (zone) return regular.filter((z) => z.id === zone);
    return regular;
  }

  function audit(tx, ctx, action, details = {}) {
    const actor = actorOf(ctx);
    tx.append("audit", {
      id: id("a"),
      at: toZonedISO(now(), tz),
      actor: { id: actor.id, name: actor.name || actor.id, role: actor.role },
      action,
      reason: reasonOf(ctx) || null,
      override: Boolean(details.override),
      ...details,
    });
  }

  function queue(tx, out, template, target, extra = {}) {
    const guest = target.guest;
    if (!guest?.email) return;
    const lang = target.lang || "it";
    const prem = premiumInfo();
    const data = {
      tz, hutName, ref: target.ref, name: guest.name, party: target.party, zone: target.zone,
      start: target.start || interval(target.date, target.slot, target.party)?.start,
      holdMinutes: policy.holdMinutes, freeCancellationHours: policy.freeCancellationHours,
      premium: target.premium ? prem : null,
      ...extra,
    };
    const { subject, text } = renderTemplate(template, lang, data);
    const msg = { id: id("m"), at: toZonedISO(now(), tz), date: target.date, to: guest.email, lang, template, subject, text, refId: target.id };
    tx.put("outbox", msg);
    out.push(msg);
  }

  /** Run a transaction; send queued messages only after it committed. */
  async function run(fn) {
    const out = [];
    const result = await store.transaction((tx) => fn(tx, out));
    if (notifier) {
      for (const m of out) {
        try { await notifier.send(m); } catch { /* delivery retried from outbox by a real worker */ }
      }
    }
    return result;
  }

  function rateLimited(tx, email, ip) {
    const rl = config.rateLimit;
    if (!rl) return false;
    const since = now() - rl.windowMinutes * 60000;
    const entries = tx.all("rate");
    for (const e of entries) if (e.at < since) tx.remove("rate", e.id);
    const count = (key) => entries.filter((e) => e.key === key && e.at >= since).length;
    if (email && count(`email:${email}`) >= rl.perEmail) return true;
    if (ip && count(`ip:${ip}`) >= rl.perIp) return true;
    return false;
  }

  function recordRate(tx, email, ip) {
    if (email) tx.put("rate", { id: id("r"), key: `email:${email}`, at: now() });
    if (ip) tx.put("rate", { id: id("r"), key: `ip:${ip}`, at: now() });
  }

  function touchGuest(tx, email, patch = {}) {
    if (!email) return null;
    const g = tx.get("guests", email) || { id: email, noShows: 0, lateCancels: 0 };
    const next = { ...g, ...patch, lastSeen: today() };
    tx.put("guests", next);
    return next;
  }

  function tryAllocate(tx, { date, slot, party, zones, iv, quota, ignorePeakRule = false, ignoreId }) {
    const ds = dayState(tx, date);
    const bookings = dayBookings(tx, date);
    const released = isReleased(date, ds);
    let lastError = "full";
    for (const zone of zones) {
      const r = allocate({
        config, zone, slot, party, startMs: iv.startMs, endMs: iv.endMs, bookings, dayState: ds,
        nowMs: now(), countsTowardQuota: quota, released, ignorePeakRule, ignoreId,
      });
      if (r.tableIds) return { ...r, zone: zone.id };
      if (r.error !== "zone_unavailable") lastError = r.error;
    }
    return { error: lastError };
  }

  // ---------------------------------------------------------------- availability

  /** Which slots and zones are open for this party size. No personal data involved. */
  function getAvailability(date, party, options = {}) {
    party = Number(party);
    if (!isValidDate(date)) return Promise.resolve(fail("invalid_date"));
    if (!Number.isInteger(party) || party < 1) return Promise.resolve(fail("invalid_party"));
    if (party > policy.maxPartyOnline) return Promise.resolve(fail("party_too_large"));
    const prem = premiumInfo();

    return run((tx) => {
      expireOffers(tx, date);
      const closed = dateRuleError(date);
      const base = { ok: true, date, party, requestOnly: party >= policy.groupRequestThreshold, premium: prem };
      if (closed) return { ...base, closed, slots: [] };

      const ds = dayState(tx, date);
      const slots = [];
      for (const slot of config.slots) {
        const iv = interval(date, slot, party);
        if (!iv) continue;
        const reason = slotRuleError(date, iv.startMs);
        const zones = {};
        for (const zone of config.zones) {
          if (zone.id === prem.zone && !prem.enabled) continue;
          const r = reason ? { error: reason } : tryAllocate(tx, { date, slot, party, zones: [zone], iv, quota: true });
          zones[zone.id] = Boolean(r.tableIds);
        }
        const regular = Object.entries(zones).some(([z, ok]) => ok && z !== prem.zone);
        slots.push({
          time: slot, start: iv.start, reason, zones,
          available: regular, premiumAvailable: Boolean(zones[prem.zone]),
          weather: ds.rain,
        });
      }
      if (options.zone) for (const s of slots) s.available = Boolean(s.zones[options.zone]);
      return { ...base, rain: ds.rain, slots };
    });
  }

  // ---------------------------------------------------------------- bookings

  async function createBooking(input, ctx = {}) {
    const staff = isStaff(ctx);
    const override = staff && Boolean(ctx.override);
    if (isSpam(input)) return fail("spam");
    if (override && !reasonOf(ctx)) return fail("reason_required");
    if (ctx.override && !staff) return fail("forbidden");

    const errors = validateBookingInput(input, config, { requirePolicy: !staff });
    if (input.premium && !premiumInfo().enabled) errors.premium = "premium_unavailable";
    if (Object.keys(errors).length) return fail("validation", { errors });

    const party = Number(input.party);
    const email = normaliseEmail(input.guest.email);
    const iv = interval(input.date, input.slot, party);
    if (!iv) return fail("validation", { errors: { slot: "invalid_slot" } });

    const created = await run((tx, out) => {
      if (!staff && rateLimited(tx, email, ctx.ip)) return fail("rate_limited");
      if (!staff) recordRate(tx, email, ctx.ip); // attempts count, not only successes
      if (!override) {
        const rule = dateRuleError(input.date) || slotRuleError(input.date, iv.startMs);
        if (rule) return fail(rule);
      }
      if (!override && policy.onePerGuestPerDay) {
        const dup = dayBookings(tx, input.date).some((b) => b.guest?.email === email && OCCUPYING.has(b.status) && b.status !== "finished");
        if (dup) return fail("duplicate_booking");
      }

      const zones = override && input.zone ? [zonesById.get(input.zone)] : candidateZones(input);
      if (zones.length === 0) return fail("zone_unavailable");
      const alloc = tryAllocate(tx, { date: input.date, slot: input.slot, party, zones, iv, quota: !override, ignorePeakRule: override });
      if (!alloc.tableIds) return fail(alloc.error === "peak_rule" || alloc.error === "walk_in_reserve" ? "full" : alloc.error, { detail: alloc.error, waitlist: true });

      const g = tx.get("guests", email);
      const strikes = (g?.noShows || 0) + (g?.lateCancels || 0);
      const prem = premiumInfo();
      let depositReason = null;
      if (input.premium && prem.model === "deposit") depositReason = "premium";
      else if (config.noShow?.depositAfter && strikes >= config.noShow.depositAfter) depositReason = "no_show_history";

      let status = "confirmed";
      if (party >= policy.groupRequestThreshold && !staff) status = "requested";
      else if (depositReason && payments) status = "pending_payment";

      const booking = {
        id: id("b"), ref: randomRef(), token: randomToken(),
        date: input.date, slot: input.slot, start: iv.start, end: iv.end,
        party, children: Number(input.children || 0), dog: Boolean(input.dog), glutenFree: Boolean(input.glutenFree),
        zone: alloc.zone, tableIds: alloc.tableIds, premium: Boolean(input.premium),
        status, source: staff ? "staff" : "online", countsTowardQuota: !override,
        guest: { name: cleanText(input.guest.name, 80), email, phone: String(input.guest.phone).trim() },
        lang: input.lang || "it", notes: cleanText(input.notes, 500),
        depositReason, deposit: null,
        createdAt: toZonedISO(now(), tz), updatedAt: toZonedISO(now(), tz),
        expiresAt: status === "pending_payment" ? toZonedISO(now() + (config.depositHoldMinutes || 15) * 60000, tz) : null,
        flags: {},
      };
      tx.put("bookings", booking);
      touchGuest(tx, email);
      if (staff) {
        audit(tx, ctx, "booking_created", {
          bookingId: booking.id, ref: booking.ref, date: booking.date, override,
          detail: `${party}p ${booking.slot} ${booking.zone} ${booking.tableIds.join("+")}`,
        });
      }
      if (status === "confirmed") queue(tx, out, "confirmation", booking, { manageUrl: link("manage", booking.token) });
      if (status === "requested") queue(tx, out, "request", booking, { manageUrl: link("manage", booking.token) });
      return { ok: true, booking };
    });

    if (!created.ok || created.booking.status !== "pending_payment") return created;
    return takeDeposit(created.booking);
  }

  async function takeDeposit(booking) {
    const prem = premiumInfo();
    const perPerson = booking.depositReason === "premium" ? prem.amountPerPerson : config.noShow.depositPerPerson;
    const res = await payments.createDeposit({
      bookingId: booking.id, amountCents: Math.round((perPerson || 0) * booking.party * 100), currency: prem.currency,
      description: `${hutName} ${booking.ref}`,
    });
    if (res.status !== "succeeded") return { ok: true, booking, payment: res };
    return run((tx, out) => {
      const b = tx.get("bookings", booking.id);
      if (!b || b.status !== "pending_payment") return fail("payment_too_late");
      b.status = "confirmed";
      b.deposit = { reference: res.reference, amountPerPerson: perPerson };
      b.expiresAt = null;
      b.updatedAt = toZonedISO(now(), tz);
      tx.put("bookings", b);
      queue(tx, out, "confirmation", b, { manageUrl: link("manage", b.token) });
      return { ok: true, booking: b, payment: res };
    });
  }

  function findByToken(tx, token) {
    if (typeof token !== "string" || token.length < 16) return null;
    return tx.all("bookings").find((b) => b.token === token) || null;
  }

  function publicView(b) {
    if (!b) return null;
    const { token, countsTowardQuota, ...rest } = b;
    return rest;
  }

  function getBookingByToken(token) {
    return run((tx) => {
      expireOffers(tx);
      const b = findByToken(tx, token);
      return b ? { ok: true, booking: publicView(b), canCancel: !["cancelled", "finished", "no_show", "expired"].includes(b.status) } : fail("not_found");
    });
  }

  /**
   * Cancel by manage token (guest) or by booking id (staff, reason required).
   */
  function cancelBooking(tokenOrId, ctx = {}) {
    const staff = isStaff(ctx);
    if (staff && !reasonOf(ctx)) return Promise.resolve(fail("reason_required"));
    return run((tx, out) => {
      const b = staff ? tx.get("bookings", tokenOrId) : findByToken(tx, tokenOrId);
      if (!b) return fail("not_found");
      if (["cancelled", "finished", "no_show", "expired"].includes(b.status)) return fail("not_cancellable");
      const late = !staff && parseISO(b.start) - now() < policy.freeCancellationHours * 3600000 && b.status !== "offered";
      b.status = "cancelled";
      b.cancelledAt = toZonedISO(now(), tz);
      b.lateCancel = late;
      b.updatedAt = b.cancelledAt;
      tx.put("bookings", b);
      if (late && b.guest?.email) {
        const g = tx.get("guests", b.guest.email) || { id: b.guest.email, noShows: 0, lateCancels: 0 };
        touchGuest(tx, b.guest.email, { lateCancels: (g.lateCancels || 0) + 1 });
      }
      for (const w of tx.all("waitlist")) {
        if (w.bookingId === b.id && w.status === "offered") tx.put("waitlist", { ...w, status: "declined" });
      }
      if (staff) audit(tx, ctx, "booking_cancelled", { bookingId: b.id, ref: b.ref, date: b.date });
      queue(tx, out, "cancellation", b);
      const offers = promoteIn(tx, out, b.date);
      return { ok: true, booking: publicView(b), lateCancel: late, offers };
    });
  }

  /** Change date/time/party of an existing booking (guest, by token). Atomic: the old table is kept if the new one is not available. */
  function changeBooking(token, changes, ctx = {}) {
    return run((tx, out) => {
      const b = findByToken(tx, token);
      if (!b) return fail("not_found");
      if (!["confirmed", "requested"].includes(b.status)) return fail("not_changeable");
      const next = { date: changes.date ?? b.date, slot: changes.slot ?? b.slot, party: Number(changes.party ?? b.party), zone: changes.zone ?? null, children: changes.children ?? b.children, premium: b.premium, acceptPremiumRule: true };
      const errors = validateBookingInput(next, config, { requireGuest: false, requirePolicy: false });
      if (Object.keys(errors).length) return fail("validation", { errors });
      const iv = interval(next.date, next.slot, next.party);
      if (!iv) return fail("validation", { errors: { slot: "invalid_slot" } });
      const rule = dateRuleError(next.date) || slotRuleError(next.date, iv.startMs);
      if (rule) return fail(rule);
      const zones = candidateZones(next);
      const alloc = tryAllocate(tx, { date: next.date, slot: next.slot, party: next.party, zones, iv, quota: true, ignoreId: b.id });
      if (!alloc.tableIds) return fail(alloc.error === "zone_unavailable" ? "full" : "full", { detail: alloc.error });
      const oldDate = b.date;
      Object.assign(b, {
        date: next.date, slot: next.slot, party: next.party, children: Number(next.children || 0),
        start: iv.start, end: iv.end, zone: alloc.zone, tableIds: alloc.tableIds, updatedAt: toZonedISO(now(), tz),
        status: next.party >= policy.groupRequestThreshold && !isStaff(ctx) ? "requested" : b.status,
      });
      tx.put("bookings", b);
      queue(tx, out, b.status === "requested" ? "request" : "confirmation", b, { manageUrl: link("manage", b.token) });
      promoteIn(tx, out, oldDate);
      return { ok: true, booking: publicView(b) };
    });
  }

  // ---------------------------------------------------------------- waitlist

  function joinWaitlist(input, ctx = {}) {
    if (isSpam(input)) return Promise.resolve(fail("spam"));
    const errors = validateBookingInput(input, config, { requirePolicy: true });
    if (Object.keys(errors).length) return Promise.resolve(fail("validation", { errors }));
    const email = normaliseEmail(input.guest.email);
    return run((tx, out) => {
      if (rateLimited(tx, email, ctx.ip)) return fail("rate_limited");
      recordRate(tx, email, ctx.ip);
      const rule = dateRuleError(input.date);
      if (rule) return fail(rule);
      const entries = tx.all("waitlist").filter((w) => w.date === input.date && w.slot === input.slot && w.status === "waiting");
      if (entries.some((w) => w.guest.email === email)) return fail("duplicate_waitlist");
      if (entries.length >= (config.waitlist?.maxPerSlot ?? 20)) return fail("waitlist_full");
      const entry = {
        id: id("w"), token: randomToken(), ref: randomRef(),
        date: input.date, slot: input.slot, party: Number(input.party), children: Number(input.children || 0),
        zone: input.zone || null, premium: Boolean(input.premium),
        guest: { name: cleanText(input.guest.name, 80), email, phone: String(input.guest.phone).trim() },
        lang: input.lang || "it", notes: cleanText(input.notes, 500),
        status: "waiting", createdAt: toZonedISO(now(), tz),
        seq: Math.max(0, ...tx.all("waitlist").map((x) => x.seq || 0)) + 1, // strict arrival order
      };
      tx.put("waitlist", entry);
      queue(tx, out, "waitlist", entry, { manageUrl: link("waitlist", entry.token) });
      return { ok: true, entry: { ...entry, token: undefined }, token: entry.token, position: entries.length + 1 };
    });
  }

  function getWaitlistEntry(token) {
    return run((tx) => {
      const w = typeof token === "string" && token.length >= 16 ? tx.all("waitlist").find((e) => e.token === token) : null;
      if (!w) return fail("not_found");
      const { token: _t, ...entry } = w;
      return { ok: true, entry };
    });
  }

  function leaveWaitlist(token) {
    return run((tx) => {
      const w = tx.all("waitlist").find((e) => e.token === token);
      if (!w) return fail("not_found");
      if (w.status !== "waiting") return fail("not_cancellable");
      tx.put("waitlist", { ...w, status: "cancelled" });
      return { ok: true };
    });
  }

  /** Offers that ran out free their table and pass the turn to the next entry. */
  function expireOffers(tx, date) {
    const t = now();
    let expired = 0;
    for (const b of tx.all("bookings")) {
      if (date && b.date !== date) continue;
      if ((b.status === "offered" || b.status === "pending_payment") && b.expiresAt && parseISO(b.expiresAt) <= t) {
        tx.put("bookings", { ...b, status: "expired", updatedAt: toZonedISO(t, tz) });
        for (const w of tx.all("waitlist")) if (w.bookingId === b.id) tx.put("waitlist", { ...w, status: "expired" });
        expired++;
      }
    }
    return expired;
  }

  /** First-come-first-served: offer free tables to the oldest compatible waitlist entries. */
  function promoteIn(tx, out, date, slot) {
    expireOffers(tx, date);
    const entries = tx.all("waitlist")
      .filter((w) => w.date === date && w.status === "waiting" && (!slot || w.slot === slot))
      .sort((a, b) => a.seq - b.seq);
    const offers = [];
    for (const w of entries) {
      const iv = interval(w.date, w.slot, w.party);
      if (!iv || iv.startMs <= now()) continue;
      const zones = candidateZones({ premium: w.premium, zone: w.zone });
      const alloc = tryAllocate(tx, { date: w.date, slot: w.slot, party: w.party, zones, iv, quota: true });
      if (!alloc.tableIds) continue;
      const expiresMs = Math.min(now() + (config.waitlist?.offerMinutes ?? 30) * 60000, iv.startMs);
      const booking = {
        id: id("b"), ref: w.ref, token: randomToken(),
        date: w.date, slot: w.slot, start: iv.start, end: iv.end, party: w.party, children: w.children,
        dog: false, glutenFree: false, zone: alloc.zone, tableIds: alloc.tableIds, premium: w.premium,
        status: "offered", source: "waitlist", countsTowardQuota: true,
        guest: w.guest, lang: w.lang, notes: w.notes, depositReason: null, deposit: null,
        createdAt: toZonedISO(now(), tz), updatedAt: toZonedISO(now(), tz), expiresAt: toZonedISO(expiresMs, tz), flags: {},
      };
      tx.put("bookings", booking);
      tx.put("waitlist", { ...w, status: "offered", bookingId: booking.id, offerExpiresAt: booking.expiresAt });
      queue(tx, out, "offer", booking, { offerUrl: link("offer", booking.token), expiresAt: booking.expiresAt });
      offers.push({ entryId: w.id, bookingId: booking.id, ref: booking.ref, expiresAt: booking.expiresAt });
    }
    return offers;
  }

  function promoteWaitlist(date, slot) {
    return run((tx, out) => ({ ok: true, offers: promoteIn(tx, out, date, slot) }));
  }

  function acceptOffer(token) {
    return run((tx, out) => {
      const b = findByToken(tx, token);
      if (!b) return fail("not_found");
      if (b.status === "offered" && parseISO(b.expiresAt) <= now()) {
        promoteIn(tx, out, b.date);
        return fail("offer_expired");
      }
      if (b.status === "expired") return fail("offer_expired");
      if (b.status !== "offered") return fail("not_offered");
      b.status = "confirmed";
      b.expiresAt = null;
      b.updatedAt = toZonedISO(now(), tz);
      tx.put("bookings", b);
      for (const w of tx.all("waitlist")) if (w.bookingId === b.id) tx.put("waitlist", { ...w, status: "accepted" });
      queue(tx, out, "confirmation", b, { manageUrl: link("manage", b.token) });
      return { ok: true, booking: publicView(b), token: b.token };
    });
  }

  // ---------------------------------------------------------------- staff operations

  function guard(ctx, role = "staff") {
    if (rank(actorOf(ctx)) < RANK[role]) return fail("forbidden");
    return null;
  }

  function saveDay(tx, ds) {
    tx.put("days", ds);
  }

  /** Rain mode: "off" | "reduced" (only covered terrace tables) | "closed". Re-seats affected bookings indoors where possible. */
  function setRainMode(date, mode, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    if (!["off", "reduced", "closed"].includes(mode)) return Promise.resolve(fail("invalid_mode"));
    return run((tx, out) => {
      const ds = dayState(tx, date);
      const previous = ds.rain;
      ds.rain = mode;
      saveDay(tx, ds);
      const moved = [];
      const affected = [];
      const fallback = (config.rain?.fallbackZones || []).map((z) => zonesById.get(z)).filter(Boolean);

      const live = dayBookings(tx, date).filter((b) => ["confirmed", "requested", "offered", "pending_payment", "seated"].includes(b.status));
      if (mode === "off") {
        for (const b of live) if (b.flags?.rainAffected) tx.put("bookings", { ...b, flags: { ...b.flags, rainAffected: false } });
      } else {
        const weatherZones = config.zones.filter((z) => z.weatherDependent);
        const stillActive = new Set(weatherZones.flatMap((z) => activeTables(z, ds).map((t) => t.id)));
        const hit = live
          .filter((b) => b.tableIds.some((tid) => tableZone.get(tid)?.weatherDependent && !stillActive.has(tid)))
          .sort((a, b) => b.party - a.party || a.start.localeCompare(b.start));
        for (const b of hit) {
          if (b.status === "seated") {
            affected.push({ bookingId: b.id, ref: b.ref, slot: b.slot, party: b.party, name: b.guest?.name || null, seated: true });
            continue;
          }
          const iv = { startMs: parseISO(b.start), endMs: parseISO(b.end) };
          const alloc = tryAllocate(tx, { date, slot: b.slot, party: b.party, zones: fallback, iv, quota: false, ignorePeakRule: true, ignoreId: b.id });
          if (alloc.tableIds) {
            const from = b.tableIds;
            const nb = { ...b, zone: alloc.zone, tableIds: alloc.tableIds, flags: { ...b.flags, rainAffected: false, movedByRain: { from } }, updatedAt: toZonedISO(now(), tz) };
            tx.put("bookings", nb);
            queue(tx, out, "rain_moved", nb);
            moved.push({ bookingId: b.id, ref: b.ref, slot: b.slot, party: b.party, name: b.guest?.name || null, from, to: alloc.tableIds });
          } else {
            const nb = { ...b, flags: { ...b.flags, rainAffected: true }, updatedAt: toZonedISO(now(), tz) };
            tx.put("bookings", nb);
            queue(tx, out, "rain_affected", nb, { manageUrl: link("manage", b.token) });
            affected.push({ bookingId: b.id, ref: b.ref, slot: b.slot, party: b.party, name: b.guest?.name || null });
          }
        }
      }
      audit(tx, ctx, "rain_mode", { date, detail: `${previous} → ${mode}; moved ${moved.length}, needs attention ${affected.length}` });
      return { ok: true, mode, moved, affected };
    });
  }

  function releaseWalkInHold(date, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    return run((tx, out) => {
      const ds = dayState(tx, date);
      ds.holdReleased = true;
      saveDay(tx, ds);
      audit(tx, ctx, "walk_in_hold_released", { date });
      return { ok: true, offers: promoteIn(tx, out, date) };
    });
  }

  /** A walk-in party sitting down now (or at `time`). Bypasses the online quota by design: that is what it is for. */
  function addWalkIn(input, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    const party = Number(input.party);
    if (!Number.isInteger(party) || party < 1) return Promise.resolve(fail("validation", { errors: { party: "invalid_party" } }));
    const date = input.date || today();
    let time = input.time;
    if (!time) {
      const m = Math.floor(nowMinutes() / 5) * 5;
      time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    }
    if (!isValidDate(date) || !isValidTime(time)) return Promise.resolve(fail("validation", { errors: { time: "invalid_time" } }));
    const iv = interval(date, time, party);
    if (!iv) return Promise.resolve(fail("validation", { errors: { time: "invalid_time" } }));
    return run((tx) => {
      let alloc;
      if (input.tableIds?.length) {
        const zone = tableZone.get(input.tableIds[0]);
        if (!zone || input.tableIds.some((t) => tableZone.get(t) !== zone)) return fail("invalid_tables");
        const ds = dayState(tx, date);
        alloc = allocate({ config, zone, slot: time, party, startMs: iv.startMs, endMs: iv.endMs, bookings: dayBookings(tx, date), dayState: ds, nowMs: now(), countsTowardQuota: false, released: true, ignorePeakRule: true, onlyTables: input.tableIds });
        if (alloc.tableIds) alloc.zone = zone.id;
      } else {
        const zones = input.zone ? [zonesById.get(input.zone)].filter(Boolean) : candidateZones({});
        alloc = tryAllocate(tx, { date, slot: time, party, zones, iv, quota: false, ignorePeakRule: true });
      }
      if (!alloc.tableIds) return fail(alloc.error === "table_too_small" ? "table_too_small" : "full");
      const booking = {
        id: id("b"), ref: randomRef(), token: randomToken(), date, slot: time, start: iv.start, end: iv.end,
        party, children: Number(input.children || 0), dog: false, glutenFree: false,
        zone: alloc.zone, tableIds: alloc.tableIds, premium: alloc.zone === premiumInfo().zone,
        status: "seated", source: "walkin", countsTowardQuota: false,
        guest: input.name ? { name: cleanText(input.name, 80) } : null, lang: "it", notes: cleanText(input.notes, 500),
        createdAt: toZonedISO(now(), tz), updatedAt: toZonedISO(now(), tz), seatedAt: toZonedISO(now(), tz), expiresAt: null, flags: {},
      };
      tx.put("bookings", booking);
      audit(tx, ctx, "walk_in", { bookingId: booking.id, ref: booking.ref, date, detail: `${party}p ${time} ${booking.tableIds.join("+")}` });
      return { ok: true, booking };
    });
  }

  function blockTable(date, tableId, ctx = {}, { unblock = false } = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    if (!tableZone.has(tableId)) return Promise.resolve(fail("invalid_tables"));
    if (!unblock && !reasonOf(ctx)) return Promise.resolve(fail("reason_required"));
    return run((tx, out) => {
      const ds = dayState(tx, date);
      if (unblock) {
        ds.blocked = ds.blocked.filter((b) => b.tableId !== tableId);
      } else {
        const holding = dayBookings(tx, date).filter((b) => b.tableIds.includes(tableId) && ["confirmed", "requested", "offered", "pending_payment", "seated"].includes(b.status));
        if (holding.length) return fail("table_has_bookings", { bookings: holding.map((b) => ({ bookingId: b.id, ref: b.ref, slot: b.slot })) });
        ds.blocked = [...ds.blocked.filter((b) => b.tableId !== tableId), { tableId, reason: reasonOf(ctx) }];
      }
      saveDay(tx, ds);
      audit(tx, ctx, unblock ? "table_unblocked" : "table_blocked", { date, tableId });
      return { ok: true, offers: unblock ? promoteIn(tx, out, date) : [] };
    });
  }

  function closeZone(date, zoneId, closed, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    if (!zonesById.has(zoneId)) return Promise.resolve(fail("invalid_zone"));
    if (!reasonOf(ctx)) return Promise.resolve(fail("reason_required"));
    return run((tx, out) => {
      const ds = dayState(tx, date);
      ds.closedZones = closed ? [...new Set([...ds.closedZones, zoneId])] : ds.closedZones.filter((z) => z !== zoneId);
      saveDay(tx, ds);
      const affected = closed
        ? dayBookings(tx, date).filter((b) => b.zone === zoneId && ["confirmed", "requested", "offered", "pending_payment"].includes(b.status)).map((b) => ({ bookingId: b.id, ref: b.ref, slot: b.slot, party: b.party }))
        : [];
      audit(tx, ctx, closed ? "zone_closed" : "zone_opened", { date, zone: zoneId, detail: closed ? `${affected.length} bookings need a new table` : "" });
      return { ok: true, affected, offers: closed ? [] : promoteIn(tx, out, date) };
    });
  }

  /**
   * Move a booking to other table(s) (drag & drop in the timeline). Never allows an overlap.
   * Rule-breaking moves (too small, peak rule, premium area, other zone) need a reason and are logged as overrides.
   */
  function moveBooking(bookingId, tableIds, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    if (!Array.isArray(tableIds) || tableIds.length === 0) return Promise.resolve(fail("invalid_tables"));
    const zone = tableZone.get(tableIds[0]);
    if (!zone || tableIds.some((t) => tableZone.get(t) !== zone)) return Promise.resolve(fail("invalid_tables"));
    return run((tx) => {
      const b = tx.get("bookings", bookingId);
      if (!b) return fail("not_found");
      const tables = zone.tables.filter((t) => tableIds.includes(t.id));
      const seats = tables.reduce((s, t) => s + t.seats, 0);
      const violations = [];
      if (seats < b.party) violations.push("table_too_small");
      if (violatesPeakRule(config, b.slot, b.party, tables)) violations.push("peak_rule");
      if (zone.id === premiumInfo().zone && !b.premium) violations.push("premium_area");
      if (zone.id !== b.zone) violations.push("zone_change");
      const isOverride = violations.some((v) => v !== "zone_change");
      if (isOverride && !reasonOf(ctx)) return fail("reason_required", { violations });

      const ds = dayState(tx, b.date);
      const r = allocate({
        config, zone, slot: b.slot, party: b.party, startMs: parseISO(b.start), endMs: parseISO(b.end),
        bookings: dayBookings(tx, b.date), dayState: ds, nowMs: now(), countsTowardQuota: false, released: true,
        ignorePeakRule: true, ignoreId: b.id, onlyTables: tableIds, allowUndersized: true,
      });
      if (r.error) return fail(r.error === "zone_unavailable" ? "table_unavailable" : r.error === "full" ? "table_taken" : r.error);
      const from = b.tableIds;
      const nb = { ...b, zone: zone.id, tableIds: [...tableIds], updatedAt: toZonedISO(now(), tz) };
      tx.put("bookings", nb);
      audit(tx, ctx, "booking_moved", { bookingId: b.id, ref: b.ref, date: b.date, override: isOverride, detail: `${from.join("+")} → ${tableIds.join("+")}${violations.length ? ` (${violations.join(", ")})` : ""}` });
      return { ok: true, booking: nb, violations };
    });
  }

  const TRANSITIONS = {
    seated: ["confirmed", "requested"],
    finished: ["seated"],
    no_show: ["confirmed"],
    confirmed: ["requested", "seated"],
    declined: ["requested"],
  };

  function setStatus(bookingId, status, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    if (!TRANSITIONS[status]) return Promise.resolve(fail("invalid_status"));
    if (status === "declined" && !reasonOf(ctx)) return Promise.resolve(fail("reason_required"));
    return run((tx, out) => {
      const b = tx.get("bookings", bookingId);
      if (!b) return fail("not_found");
      if (!TRANSITIONS[status].includes(b.status)) return fail("invalid_transition", { from: b.status, to: status });
      if (status === "no_show" && parseISO(b.start) > now()) return fail("too_early");
      const stamp = toZonedISO(now(), tz);
      const from = b.status;
      const nb = { ...b, status: status === "declined" ? "cancelled" : status, updatedAt: stamp };
      if (status === "seated") nb.seatedAt = stamp;
      if (status === "finished") nb.finishedAt = stamp;
      if (status === "no_show" && b.guest?.email) {
        const g = tx.get("guests", b.guest.email) || { id: b.guest.email, noShows: 0, lateCancels: 0 };
        touchGuest(tx, b.guest.email, { noShows: (g.noShows || 0) + 1 });
      }
      tx.put("bookings", nb);
      if (from === "requested" && status === "confirmed") queue(tx, out, "confirmation", nb, { manageUrl: link("manage", nb.token) });
      if (status === "declined") queue(tx, out, "cancellation", nb);
      audit(tx, ctx, `status_${status}`, { bookingId: b.id, ref: b.ref, date: b.date, detail: `${from} → ${nb.status}` });
      const offers = ["finished", "no_show", "declined"].includes(status) ? promoteIn(tx, out, b.date) : [];
      return { ok: true, booking: nb, offers };
    });
  }

  function statsFor(bookings, waitlist) {
    const stats = { bookings: 0, covers: 0, walkIns: 0, walkInCovers: 0, noShows: 0, cancelled: 0, premiumCovers: 0, waitlist: 0, byZone: {}, byStatus: {} };
    for (const b of bookings) {
      stats.byStatus[b.status] = (stats.byStatus[b.status] || 0) + 1;
      if (b.status === "no_show") stats.noShows++;
      if (b.status === "cancelled") stats.cancelled++;
      if (!["confirmed", "seated", "finished", "requested"].includes(b.status)) continue;
      if (b.source === "walkin") { stats.walkIns++; stats.walkInCovers += b.party; } else stats.bookings++;
      stats.covers += b.party;
      if (b.premium) stats.premiumCovers += b.party;
      stats.byZone[b.zone] = (stats.byZone[b.zone] || 0) + b.party;
    }
    stats.waitlist = waitlist.filter((w) => w.status === "waiting").length;
    return stats;
  }

  /** Staff view of one day. */
  function getDay(date, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    return run((tx, out) => {
      expireOffers(tx, date);
      promoteIn(tx, out, date);
      const ds = dayState(tx, date);
      const bookings = dayBookings(tx, date).sort((a, b) => a.start.localeCompare(b.start));
      const waitlist = tx.all("waitlist").filter((w) => w.date === date).sort((a, b) => a.seq - b.seq);
      const released = isReleased(date, ds);
      const quota = config.zones.map((zone) => {
        const active = activeTables(zone, ds);
        return { zone: zone.id, seats: active.reduce((s, t) => s + t.seats, 0), onlineCap: onlineCap(config, zone, active, released) };
      });
      const late = bookings.filter((b) => b.status === "confirmed" && now() > parseISO(b.start) + policy.holdMinutes * 60000).map((b) => b.id);
      const outbox = tx.all("outbox").filter((m) => m.date === date).sort((a, b) => a.at.localeCompare(b.at));
      return { ok: true, date, dayState: ds, released, bookings, waitlist, stats: statsFor(bookings, waitlist), quota, late, outbox };
    });
  }

  /** Peak online-quota usage per zone for a given slot (used by the admin header). */
  function quotaAt(date, slot, ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    return run((tx) => {
      const ds = dayState(tx, date);
      const iv = interval(date, slot, 2);
      const bookings = dayBookings(tx, date);
      return {
        ok: true,
        zones: config.zones.map((zone) => ({
          zone: zone.id,
          used: onlineSeatsUsed(zone, bookings, iv.startMs, iv.startMs + 60000, now()),
          cap: onlineCap(config, zone, activeTables(zone, ds), isReleased(date, ds)),
        })),
      };
    });
  }

  function getAuditLog(ctx = {}, { date } = {}) {
    const denied = guard(ctx, "owner");
    if (denied) return Promise.resolve(denied);
    return run((tx) => ({ ok: true, entries: tx.all("audit").filter((e) => !date || e.date === date || e.at.startsWith(date)).sort((a, b) => b.at.localeCompare(a.at)) }));
  }

  function noShowList(ctx = {}) {
    const denied = guard(ctx);
    if (denied) return Promise.resolve(denied);
    return run((tx) => ({
      ok: true,
      guests: tx.all("guests").filter((g) => g.noShows || g.lateCancels).map((g) => ({
        email: g.id, noShows: g.noShows || 0, lateCancels: g.lateCancels || 0,
        depositRequired: (g.noShows || 0) + (g.lateCancels || 0) >= (config.noShow?.depositAfter ?? Infinity),
      })).sort((a, b) => b.noShows + b.lateCancels - (a.noShows + a.lateCancels)),
    }));
  }

  function exportCSV(date, ctx = {}) {
    const denied = guard(ctx, "owner");
    if (denied) return Promise.resolve(denied);
    return run((tx) => {
      const header = ["ref", "date", "time", "zone", "tables", "party", "children", "status", "source", "premium", "name", "phone", "dog", "gluten_free", "notes"];
      const rows = dayBookings(tx, date).sort((a, b) => a.start.localeCompare(b.start)).map((b) => [
        b.ref, b.date, b.slot, b.zone, b.tableIds.join("+"), b.party, b.children, b.status, b.source, b.premium ? "yes" : "",
        b.guest?.name || "", b.guest?.phone || "", b.dog ? "yes" : "", b.glutenFree ? "yes" : "", b.notes || "",
      ]);
      audit(tx, ctx, "csv_export", { date });
      return { ok: true, csv: [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n" };
    });
  }

  // ---------------------------------------------------------------- GDPR

  const ANON = (b) => ({ ...b, guest: null, notes: "", token: null, anonymised: true });

  /** Anonymise everything older than the retention period. Run daily (owner/system). */
  function purgeExpired(ctx = { actor: { id: "system", role: "system" } }) {
    const denied = guard(ctx, "owner");
    if (denied) return Promise.resolve(denied);
    return run((tx) => {
      const cutoff = addMonths(today(), -config.retentionMonths);
      let bookings = 0, waitlist = 0, messages = 0, guests = 0;
      for (const b of tx.all("bookings")) if (b.date < cutoff && !b.anonymised) { tx.put("bookings", ANON(b)); bookings++; }
      for (const w of tx.all("waitlist")) if (w.date < today()) { tx.remove("waitlist", w.id); waitlist++; }
      for (const m of tx.all("outbox")) if (m.date < cutoff) { tx.remove("outbox", m.id); messages++; }
      for (const g of tx.all("guests")) if ((g.lastSeen || "") < cutoff) { tx.remove("guests", g.id); guests++; }
      audit(tx, ctx, "retention_purge", { detail: `cutoff ${cutoff}: ${bookings} bookings anonymised, ${waitlist} waitlist, ${messages} messages, ${guests} guest records removed` });
      return { ok: true, cutoff, bookings, waitlist, messages, guests };
    });
  }

  /** Right to erasure: cancel future bookings and anonymise everything for this email. */
  function deleteGuestData(email, ctx = {}) {
    const denied = guard(ctx, "owner");
    if (denied) return Promise.resolve(denied);
    const e = normaliseEmail(email);
    if (validateGuest({ name: "xx", phone: "000000", email: e }).email) return Promise.resolve(fail("invalid_email"));
    return run((tx, out) => {
      let count = 0;
      const dates = new Set();
      for (const b of tx.all("bookings")) {
        if (b.guest?.email !== e) continue;
        const active = OCCUPYING.has(b.status) && b.status !== "finished" && b.date >= today();
        tx.put("bookings", ANON({ ...b, status: active ? "cancelled" : b.status }));
        if (active) dates.add(b.date);
        count++;
      }
      for (const w of tx.all("waitlist")) if (w.guest?.email === e) { tx.remove("waitlist", w.id); count++; }
      for (const m of tx.all("outbox")) if (m.to === e) tx.remove("outbox", m.id);
      tx.remove("guests", e);
      audit(tx, ctx, "guest_data_deleted", { detail: `${count} records anonymised` });
      for (const d of dates) promoteIn(tx, out, d);
      return { ok: true, count };
    });
  }

  return {
    config, premiumInfo, interval,
    getAvailability, createBooking, cancelBooking, changeBooking, getBookingByToken,
    allocateTable: (date, slot, party, options = {}) => run((tx) => {
      const iv = interval(date, slot, party);
      if (!iv) return fail("invalid_slot");
      const r = tryAllocate(tx, { date, slot, party, zones: candidateZones(options), iv, quota: options.quota ?? true });
      return r.tableIds ? { ok: true, ...r } : fail(r.error);
    }),
    joinWaitlist, getWaitlistEntry, leaveWaitlist, promoteWaitlist, acceptOffer,
    setRainMode, releaseWalkInHold, addWalkIn, blockTable, closeZone, moveBooking, setStatus,
    getDay, quotaAt, getAuditLog, noShowList, exportCSV, purgeExpired, deleteGuestData,
  };
}
