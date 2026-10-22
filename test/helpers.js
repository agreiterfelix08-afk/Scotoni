import { createEngine } from "../src/reservation-engine/engine.js";
import { MemoryStore } from "../src/reservation-engine/stores/memory-store.js";
import { zonedToUtcMs } from "../src/reservation-engine/time.js";

// A small, fixed table plan so tests do not depend on the hut's real config.
export function testConfig(patch = {}) {
  const base = {
    timezone: "Europe/Rome",
    slots: ["12:00", "12:30", "13:00"],
    dwell: [{ maxParty: 4, minutes: 90 }, { maxParty: 99, minutes: 120 }],
    maxCombine: 3,
    zones: [
      {
        id: "stube", weatherDependent: false, onlineShare: 1,
        tables: [
          { id: "S1", seats: 2, combinableWith: ["S2"] },
          { id: "S2", seats: 2, combinableWith: ["S1"] },
          { id: "S3", seats: 4, combinableWith: ["S4"] },
          { id: "S4", seats: 6, combinableWith: ["S3"] },
        ],
      },
      {
        id: "terrace", weatherDependent: true, onlineShare: 1,
        tables: [
          { id: "T1", seats: 4, covered: true, combinableWith: [] },
          { id: "T2", seats: 4, combinableWith: [] },
          { id: "T3", seats: 2, combinableWith: [] },
        ],
      },
      { id: "premium", weatherDependent: false, onlineShare: 1, tables: [{ id: "P1", seats: 4, combinableWith: [] }] },
    ],
    walkIn: { releaseAt: "10:30" },
    peak: { slots: ["12:30"], protectLargeTables: true, largeTableSeats: 6, minPartyForLargeTable: 4 },
    overbooking: { enabled: false, percent: 0 },
    policy: {
      bookingWindowDays: 60, sameDayCutoff: "11:00", minLeadMinutes: 60, holdMinutes: 15,
      freeCancellationHours: 24, groupRequestThreshold: 9, maxPartyOnline: 16, onePerGuestPerDay: true,
    },
    noShow: { depositAfter: 2, depositPerPerson: 15 },
    premium: { enabled: true, zone: "premium", model: "minimumSpend", minimumSpendPerPerson: 40, depositPerPerson: 20, currency: "EUR" },
    rain: { fallbackZones: ["stube"] },
    waitlist: { offerMinutes: 30, maxPerSlot: 3 },
    depositHoldMinutes: 15,
    rateLimit: { windowMinutes: 60, perEmail: 4, perIp: 12 },
    retentionMonths: 12,
    seasons: null, closedWeekdays: [], closedDates: [],
  };
  return { ...base, ...patch, policy: { ...base.policy, ...(patch.policy || {}) } };
}

/** Engine with a controllable clock (Europe/Rome wall time). */
export function setup({ config = testConfig(), at = ["2026-07-01", "08:00"], ...deps } = {}) {
  const clock = { ms: zonedToUtcMs(at[0], at[1], "Europe/Rome") };
  clock.set = (date, time) => { clock.ms = zonedToUtcMs(date, time, "Europe/Rome"); };
  clock.advance = (minutes) => { clock.ms += minutes * 60000; };
  const store = deps.store || new MemoryStore();
  const sent = [];
  const notifier = { send: async (m) => { sent.push(m); } };
  const engine = createEngine({ config, store, clock: () => clock.ms, notifier, ...deps });
  return { engine, store, clock, sent };
}

let n = 0;
export function guest(overrides = {}) {
  n++;
  return { name: `Guest ${n}`, email: `guest${n}@example.com`, phone: "+39 333 123 4567", ...overrides };
}

export function booking(overrides = {}) {
  return {
    date: "2026-07-04", slot: "12:00", party: 2, guest: guest(), acceptPolicy: true, lang: "en", ...overrides,
  };
}

export const STAFF = { actor: { id: "anna", name: "Anna", role: "staff" } };
export const OWNER = { actor: { id: "christian", name: "Christian", role: "owner" } };
