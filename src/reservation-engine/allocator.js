// Table allocation: pure functions, no I/O.
//
// A booking occupies its tables from `start` to `end` (ISO strings with offset).
// The allocator picks the smallest table, or combination of combinable tables,
// that is free for the whole interval and respects the zone rules.

import { parseISO } from "./time.js";

export const OCCUPYING = new Set(["confirmed", "requested", "offered", "pending_payment", "seated", "finished"]);

/** Does this booking hold its tables at instant range [startMs, endMs)? */
export function occupies(booking, startMs, endMs, nowMs) {
  if (!OCCUPYING.has(booking.status)) return false;
  if ((booking.status === "offered" || booking.status === "pending_payment") && booking.expiresAt && parseISO(booking.expiresAt) <= nowMs) {
    return false;
  }
  const bStart = parseISO(booking.start);
  let bEnd = parseISO(booking.end);
  if (booking.status === "finished" && booking.finishedAt) bEnd = Math.min(bEnd, parseISO(booking.finishedAt));
  return bStart < endMs && startMs < bEnd;
}

export function dwellMinutes(config, party) {
  const rule = config.dwell.find((d) => party <= d.maxParty) || config.dwell[config.dwell.length - 1];
  return rule.minutes;
}

/** Tables of a zone that can be used today (zone open, table not blocked, weather mode). */
export function activeTables(zone, dayState = {}) {
  if (dayState.closedZones?.includes(zone.id)) return [];
  const blocked = new Set((dayState.blocked || []).map((b) => b.tableId));
  const rain = dayState.rain || "off";
  return zone.tables.filter((t) => {
    if (blocked.has(t.id)) return false;
    if (zone.weatherDependent && rain === "closed") return false;
    if (zone.weatherDependent && rain === "reduced" && !t.covered) return false;
    return true;
  });
}

/** All connected combinations (up to maxCombine tables) inside one zone. */
export function tableOptions(tables, maxCombine = 3) {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const seen = new Set();
  const options = [];
  const visit = (ids) => {
    const key = [...ids].sort().join("+");
    if (seen.has(key)) return;
    seen.add(key);
    options.push(ids.map((id) => byId.get(id)));
    if (ids.length >= maxCombine) return;
    for (const id of ids) {
      for (const next of byId.get(id).combinableWith || []) {
        if (byId.has(next) && !ids.includes(next)) visit([...ids, next]);
      }
    }
  };
  for (const t of tables) visit([t.id]);
  return options;
}

function fitsParty(option, party) {
  const seats = option.reduce((s, t) => s + t.seats, 0);
  if (seats < party) return false;
  if (option.length === 1) {
    const [t] = option;
    if (party < (t.minParty || 1)) return false;
    if (party > (t.maxParty || t.seats)) return false;
  }
  return true;
}

/** Peak-hour rule: a small party must not take a large table. */
export function violatesPeakRule(config, slot, party, option) {
  const peak = config.peak;
  if (!peak?.protectLargeTables || !peak.slots?.includes(slot)) return false;
  if (party >= peak.minPartyForLargeTable) return false;
  return option.some((t) => t.seats >= peak.largeTableSeats);
}

/** Seats used by online-quota bookings in a zone during [startMs, endMs). */
export function onlineSeatsUsed(zone, bookings, startMs, endMs, nowMs, ignoreId) {
  const ids = new Set(zone.tables.map((t) => t.id));
  const used = new Set();
  for (const b of bookings) {
    if (b.id === ignoreId || !b.countsTowardQuota) continue;
    if (!occupies(b, startMs, endMs, nowMs)) continue;
    for (const id of b.tableIds) if (ids.has(id)) used.add(id);
  }
  return [...used].reduce((s, id) => s + zone.tables.find((t) => t.id === id).seats, 0);
}

/** Seat cap for online bookings in a zone (the rest is held for walk-ins). */
export function onlineCap(config, zone, active, released) {
  const seats = active.reduce((s, t) => s + t.seats, 0);
  if (released) return seats;
  const over = config.overbooking?.enabled ? config.overbooking.percent / 100 : 0;
  return Math.min(seats, Math.floor(seats * zone.onlineShare * (1 + over)));
}

/**
 * Find the best table(s) for a party.
 *
 * @param {object} p
 * @param {object} p.config        reservations config
 * @param {object} p.zone          zone definition
 * @param {string} p.slot          "HH:MM"
 * @param {number} p.party
 * @param {number} p.startMs
 * @param {number} p.endMs
 * @param {object[]} p.bookings    all bookings of the day
 * @param {object} p.dayState      rain mode, blocked tables, closed zones, hold release
 * @param {number} p.nowMs
 * @param {boolean} p.countsTowardQuota  true for online/waitlist bookings
 * @param {boolean} p.released     walk-in hold released for this day
 * @param {boolean} p.ignorePeakRule  staff override
 * @param {string}  [p.ignoreId]   booking being moved/changed
 * @param {string[]} [p.onlyTables] restrict to these table ids (staff move)
 * @returns {{tableIds: string[], seats: number} | {error: string}}
 */
export function allocateTable(p) {
  const { config, zone, slot, party, startMs, endMs, bookings, dayState, nowMs } = p;
  let tables = activeTables(zone, dayState);
  if (tables.length === 0) return { error: "zone_unavailable" };
  if (p.onlyTables) {
    tables = tables.filter((t) => p.onlyTables.includes(t.id));
    if (tables.length !== p.onlyTables.length) return { error: "zone_unavailable" };
  }

  const busy = new Set();
  for (const b of bookings) {
    if (b.id === p.ignoreId) continue;
    if (occupies(b, startMs, endMs, nowMs)) b.tableIds.forEach((id) => busy.add(id));
  }

  let options = p.onlyTables
    ? [tables]
    : tableOptions(tables, config.maxCombine ?? 3);
  options = options.filter((o) => o.length > 0 && o.every((t) => !busy.has(t.id)));
  if (options.length === 0) return { error: "full" };

  options = options.filter((o) => fitsParty(o, party) || (p.onlyTables && p.allowUndersized));
  if (options.length === 0) return { error: p.onlyTables ? "table_too_small" : "full" };

  if (!p.ignorePeakRule) {
    options = options.filter((o) => !violatesPeakRule(config, slot, party, o));
    if (options.length === 0) return { error: "peak_rule" };
  }

  if (p.countsTowardQuota) {
    const cap = onlineCap(config, zone, activeTables(zone, dayState), p.released);
    const used = onlineSeatsUsed(zone, bookings, startMs, endMs, nowMs, p.ignoreId);
    options = options.filter((o) => used + o.reduce((s, t) => s + t.seats, 0) <= cap);
    if (options.length === 0) return { error: "walk_in_reserve" };
  }

  options.sort((a, b) => {
    const wa = a.reduce((s, t) => s + t.seats, 0) - party;
    const wb = b.reduce((s, t) => s + t.seats, 0) - party;
    if (wa !== wb) return wa - wb;
    if (a.length !== b.length) return a.length - b.length;
    return a.map((t) => t.id).join().localeCompare(b.map((t) => t.id).join());
  });
  const best = options[0];
  return { tableIds: best.map((t) => t.id), seats: best.reduce((s, t) => s + t.seats, 0) };
}
