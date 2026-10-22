// Trail card: extension toggle and "add to calendar" (an .ics file made on the device, works offline).
import { hut } from "../data/hut.config.js";
import { trail } from "../data/trail.js";
import { toICS } from "../reservation-engine/ics.js";
import { addDays, toZonedISO, zonedParts, zonedToUtcMs } from "../reservation-engine/time.js";
import { download } from "./dom.js";
import { loadDict, t, TZ } from "./i18n.js";

export async function init([root]) {
  await loadDict();
  const toggle = root.querySelector("[data-trail-extension]");
  const svg = root.querySelector(".profile-svg");
  const text = root.querySelector("[data-trail-extension-text]");
  toggle.addEventListener("change", () => {
    svg.classList.toggle("show-extension", toggle.checked);
    text.hidden = !toggle.checked;
  });

  const form = root.querySelector("[data-trail-calendar]");
  const dateInput = form.elements.date;
  const today = zonedParts(Date.now(), TZ).date;
  dateInput.min = today;
  dateInput.value = addDays(today, 1);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const start = zonedToUtcMs(dateInput.value, form.elements.time.value, TZ);
    if (start == null) return;
    const minutes = trail.minutes + (toggle.checked ? trail.extension.minutes : 0);
    const ics = toICS({
      uid: `hike-${dateInput.value}-${form.elements.time.value}@scotoni`,
      start: toZonedISO(start, TZ),
      end: toZonedISO(start + minutes * 60000, TZ),
      title: t("trail.calendar_event"),
      description: t("trail.calendar_desc"),
      location: `${trail.start.name} → ${hut.name}`,
      geo: hut.geo,
    });
    download(`rifugio-scotoni-${dateInput.value}.ics`, ics, "text/calendar");
  });
}
