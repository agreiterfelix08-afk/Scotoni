// "Load demo day": fills one day with clearly labelled demo data, created through the real
// engine and its rules (bookings made "a week before", service actions "during lunch"),
// so what the owner sees is exactly what the system would do.
import { createEngine } from "../reservation-engine/engine.js";
import { addDays, zonedToUtcMs } from "../reservation-engine/time.js";
import { store, config } from "./engine-setup.js";

const TZ = "Europe/Rome";
const DEMO_STAFF = { actor: { id: "demo", name: "Demo", role: "staff" } };

// [slot, party, zone (null = any), extras]
const PLAN = [
  ["11:30", 2, "terrace"], ["11:30", 4, "stube"], ["11:30", 2, null],
  ["12:00", 10, null], // group → "request" status, staff confirms
  ["12:00", 2, "stube"], ["12:00", 4, "terrace"], ["12:00", 6, "stube"], ["12:00", 3, "terrace", { children: 1, dog: true }], ["12:00", 2, "premium"],
  ["12:30", 4, "stube"], ["12:30", 2, "terrace"], ["12:30", 5, "terrace"], ["12:30", 2, "stube", { glutenFree: true }], ["12:30", 4, "premium"],
  ["13:00", 2, "terrace"], ["13:00", 4, "stube"],
  ["13:30", 3, "stube"], ["13:30", 2, "terrace"],
  ["14:00", 2, "stube"],
];

export async function loadDemoDay(date, { lang = "it", name = (n) => `Demo ${n}` } = {}) {
  await store.reset();
  const at = (d, time) => () => zonedToUtcMs(d, time, TZ);
  const early = createEngine({ config, store, clock: at(addDays(date, -7), "08:00") });
  let n = 0;
  const made = [];
  const guest = () => {
    n++;
    return { name: name(n), email: `demo${n}@example.invalid`, phone: `+39 000 000 ${String(n).padStart(4, "0")}` };
  };
  for (const [slot, party, zone, extra = {}] of PLAN) {
    if (!config.slots.includes(slot)) continue;
    const premium = zone === "premium";
    const r = await early.createBooking({
      date, slot, party, zone: premium ? null : zone, premium, acceptPremiumRule: premium,
      guest: guest(), notes: "DEMO", acceptPolicy: true, lang, ...extra,
    });
    if (r.ok) made.push(r.booking);
  }
  for (const party of [4, 2]) {
    await early.joinWaitlist({ date, slot: "12:30", party, guest: guest(), notes: "DEMO", acceptPolicy: true, lang });
  }

  // Lunch service, 12:40: earlier guests seated, one no-show, walk-ins arrive.
  const during = createEngine({ config, store, clock: at(date, "12:40") });
  const noShow = made.find((b) => b.slot === "12:00" && b.status === "confirmed" && b.party <= 3 && !b.premium);
  for (const b of made) {
    if (b === noShow || b.status !== "confirmed" || !["11:30", "12:00"].includes(b.slot)) continue;
    await during.setStatus(b.id, "seated", DEMO_STAFF);
    if (b.slot === "11:30" && b.zone === "terrace") await during.setStatus(b.id, "finished", DEMO_STAFF);
  }
  if (noShow) await during.setStatus(noShow.id, "no_show", DEMO_STAFF);
  await during.addWalkIn({ date, time: "12:10", party: 5, name: "Demo hikers" }, DEMO_STAFF);
  await during.addWalkIn({ date, time: "12:35", party: 2, zone: "terrace", name: "Demo walk-in" }, DEMO_STAFF);
  return { bookings: made.length, planned: PLAN.length };
}
