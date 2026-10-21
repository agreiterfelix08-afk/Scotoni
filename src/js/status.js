// Live "open / closed" strip. Uses only what the hut configured; with no hours set it says
// so instead of guessing.
import { hut } from "../data/hut.config.js";
import { addDays, inSeason, timeToMinutes, weekday, zonedParts, zonedToUtcMs } from "../reservation-engine/time.js";
import { loadDict, t, locale, TZ } from "./i18n.js";

function isOpenDay(date) {
  if (!inSeason(date, hut.seasons)) return false;
  if (hut.closedDates.includes(date) || hut.closedWeekdays.includes(weekday(date))) return false;
  return Boolean(hut.openingHours?.[weekday(date)]);
}

export function computeStatus(nowMs = Date.now()) {
  if (!hut.openingHours) return { state: "unknown", text: t("status.unconfirmed") };
  const { date, minutesOfDay } = zonedParts(nowMs, TZ);
  if (isOpenDay(date)) {
    const [open, close] = hut.openingHours[weekday(date)];
    if (minutesOfDay >= timeToMinutes(open) && minutesOfDay < timeToMinutes(close)) return { state: "open", text: t("status.open_now", { time: close }) };
    if (minutesOfDay < timeToMinutes(open)) return { state: "closed", text: t("status.opens_today", { time: open }) };
  }
  for (let i = 1; i <= 370; i++) {
    const d = addDays(date, i);
    if (!isOpenDay(d)) continue;
    const [open] = hut.openingHours[weekday(d)];
    const when = new Date(zonedToUtcMs(d, open, TZ) ?? Date.parse(`${d}T12:00:00Z`));
    if (i > 7 && hut.seasons && !inSeason(date, hut.seasons)) {
      return { state: "closed", text: t("status.season_opens", { date: when.toLocaleDateString(locale, { timeZone: TZ, day: "numeric", month: "long" }) }) };
    }
    const day = when.toLocaleDateString(locale, { timeZone: TZ, weekday: "long" });
    return { state: "closed", text: t("status.next_opening", { day, time: open }) };
  }
  return { state: "closed", text: t("status.out_of_season") };
}

export async function init(roots) {
  await loadDict();
  const render = () => {
    const s = computeStatus();
    for (const root of roots) {
      root.querySelector("[data-status-text]").textContent = s.text;
      const dot = root.querySelector("[data-status-dot]");
      dot.classList.toggle("is-open", s.state === "open");
      dot.classList.toggle("is-closed", s.state === "closed");
    }
  };
  render();
  setInterval(render, 60000);
}
