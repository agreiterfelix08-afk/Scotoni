// Input validation. Runs inside the engine, so it is the same check whether the
// engine runs in the browser prototype or on a server. Returns error *codes*;
// the UI translates them per field.

import { isValidDate, isValidTime } from "./time.js";

export const LANGS = ["it", "de", "en"];
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function cleanText(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validateGuest(guest = {}) {
  const errors = {};
  const name = cleanText(guest.name, 81);
  if (name.length < 2 || name.length > 80 || CONTROL.test(guest.name || "")) errors.name = "invalid_name";
  const email = normaliseEmail(guest.email);
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email)) errors.email = "invalid_email";
  const phone = String(guest.phone || "").trim();
  const digits = phone.replace(/\D/g, "");
  if (!/^\+?[\d\s()./-]+$/.test(phone) || digits.length < 6 || digits.length > 15) errors.phone = "invalid_phone";
  return errors;
}

/** Validate a guest booking request. `config` = reservations config. */
export function validateBookingInput(input, config, { requireGuest = true, requirePolicy = true } = {}) {
  const errors = {};
  if (!isValidDate(input.date)) errors.date = "invalid_date";
  if (!isValidTime(input.slot) || !config.slots.includes(input.slot)) errors.slot = "invalid_slot";

  const party = Number(input.party);
  if (!Number.isInteger(party) || party < 1) errors.party = "invalid_party";
  else if (party > config.policy.maxPartyOnline) errors.party = "party_too_large";

  const children = Number(input.children || 0);
  if (!Number.isInteger(children) || children < 0 || (Number.isInteger(party) && children >= party)) errors.children = "invalid_children";

  if (input.zone != null && !config.zones.some((z) => z.id === input.zone)) errors.zone = "invalid_zone";
  if (input.notes != null && String(input.notes).length > 500) errors.notes = "notes_too_long";
  if (input.lang != null && !LANGS.includes(input.lang)) errors.lang = "invalid_lang";

  if (requireGuest) Object.assign(errors, validateGuest(input.guest));
  if (requirePolicy && input.acceptPolicy !== true) errors.acceptPolicy = "policy_required";
  if (input.premium && input.acceptPremiumRule !== true) errors.acceptPremiumRule = "premium_rule_required";
  return errors;
}

/** Honeypot: a hidden field real people never fill in. */
export function isSpam(input) {
  return typeof input.website === "string" && input.website.trim() !== "";
}
