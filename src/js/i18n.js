// Runtime translations for text created by scripts. Static page text is pre-rendered.
import { hut } from "../data/hut.config.js";

export const lang = ["it", "de", "en"].includes(document.documentElement.lang) ? document.documentElement.lang : "it";
export const locale = { it: "it-IT", de: "de-DE", en: "en-GB" }[lang];
export const TZ = "Europe/Rome";

const fmt = new Intl.NumberFormat(locale);
const BASE_VARS = {
  altitude: fmt.format(hut.altitudeM),
  family: hut.family,
  years: hut.familyYears,
  beds: hut.beds,
  wines: fmt.format(hut.wineLabels),
  email: hut.email,
};

let dict = null;

export async function loadDict() {
  if (!dict) dict = (await import(`../i18n/${lang}.js`)).default;
  return dict;
}

export function t(key, vars = {}) {
  const s = dict?.[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : k in BASE_VARS ? String(BASE_VARS[k]) : m));
}

export function errorText(code, vars = {}) {
  const key = `err.${code}`;
  return dict && key in dict ? t(key, vars) : t("err.unknown");
}

export function formatDate(iso, opts = { weekday: "long", day: "numeric", month: "long" }) {
  return new Date(iso).toLocaleDateString(locale, { timeZone: TZ, ...opts });
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(locale, { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

export function formatMoney(amount, currency = "EUR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}
