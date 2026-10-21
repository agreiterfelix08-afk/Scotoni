// Time zone helpers. All scheduling happens in the hut's zone (Europe/Rome).
// Pure functions on top of Intl; no dependency, works in browsers and Node.

const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of a UTC instant in `tz`. */
export function zonedParts(utcMs, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(utcMs))) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    seconds: Number(p.second),
    minutesOfDay: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Offset of `tz` from UTC at the given instant, in minutes (Rome: 60 or 120). */
export function tzOffsetMinutes(utcMs, tz) {
  const whole = Math.floor(utcMs / 1000) * 1000;
  const { date, time, seconds } = zonedParts(whole, tz);
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Math.round((Date.UTC(y, mo - 1, d, h, mi, seconds) - whole) / 60000);
}

/**
 * Local wall time in `tz` → UTC milliseconds.
 * Returns null for a time that does not exist (spring-forward gap).
 * For an ambiguous time (autumn fall-back) the earlier instant is returned.
 */
export function zonedToUtcMs(date, time, tz) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const offsets = new Set([
    tzOffsetMinutes(naive - 86400000, tz),
    tzOffsetMinutes(naive, tz),
    tzOffsetMinutes(naive + 86400000, tz),
  ]);
  const matches = [...offsets]
    .map((off) => naive - off * 60000)
    .filter((ms) => {
      const p = zonedParts(ms, tz);
      return p.date === date && p.time === time;
    })
    .sort((a, b) => a - b);
  return matches.length ? matches[0] : null;
}

/** UTC ms → ISO 8601 string with the zone's offset, e.g. 2026-07-04T12:30:00+02:00 */
export function toZonedISO(utcMs, tz) {
  const off = tzOffsetMinutes(utcMs, tz);
  const { date, time, seconds } = zonedParts(utcMs, tz);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${date}T${time}:${String(seconds).padStart(2, "0")}${sign}${hh}:${mm}`;
}

export function parseISO(iso) {
  return Date.parse(iso);
}

/** Calendar arithmetic on YYYY-MM-DD strings (zone independent). */
export function addDays(date, n) {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(date, n) {
  const [y, mo, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, mo - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date) {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function isValidDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTime(time) {
  return typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "MM-DD" inside an inclusive season range that may wrap the new year. */
export function inSeason(date, seasons) {
  if (!seasons || seasons.length === 0) return true;
  const md = date.slice(5);
  return seasons.some(({ from, to }) => (from <= to ? md >= from && md <= to : md >= from || md <= to));
}
