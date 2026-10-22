// Minimal iCalendar (RFC 5545) generator. Times are written in UTC ("Z"),
// which every calendar app converts correctly, so no VTIMEZONE block is needed.

import { parseISO } from "./time.js";

function stamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/** Fold lines at 75 octets as required by the spec. */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

/**
 * @param {object} e
 * @param {string} e.uid
 * @param {string} e.start  ISO with offset
 * @param {string} e.end    ISO with offset
 * @param {string} e.title
 * @param {string} [e.description]
 * @param {string} [e.location]
 * @param {{lat:number, lon:number}} [e.geo]
 * @param {number} [e.nowMs]
 */
export function toICS(e) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rifugio Scotoni//Reservations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(e.uid)}`,
    `DTSTAMP:${stamp(e.nowMs ?? Date.now())}`,
    `DTSTART:${stamp(parseISO(e.start))}`,
    `DTEND:${stamp(parseISO(e.end))}`,
    `SUMMARY:${escapeText(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.geo) lines.push(`GEO:${e.geo.lat};${e.geo.lon}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
