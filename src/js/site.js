// Entry point for every page: theme, navigation, language memory, alert banner,
// offline support, and lazy loading of the page's interactive modules.
import { hut } from "../data/hut.config.js";
import { h, clear, prefs, $, $$ } from "./dom.js";
import { zonedParts } from "../reservation-engine/time.js";

const html = document.documentElement;

function initTheme() {
  const btn = $("[data-theme-toggle]");
  if (!btn) return;
  const label = $("[data-theme-label]", btn);
  const order = ["auto", "day", "night"];
  const apply = (mode) => {
    if (mode === "day") html.dataset.theme = "light";
    else if (mode === "night") html.dataset.theme = "dark";
    else delete html.dataset.theme;
    label.textContent = btn.dataset[`label${mode[0].toUpperCase()}${mode.slice(1)}`] || mode;
  };
  let mode = prefs.get("scotoni-theme") || "auto";
  if (!order.includes(mode)) mode = "auto";
  apply(mode);
  btn.addEventListener("click", () => {
    mode = order[(order.indexOf(mode) + 1) % order.length];
    prefs.set("scotoni-theme", mode);
    apply(mode);
  });
}

function initNav() {
  const toggle = $(".nav-toggle");
  const nav = $("#site-nav");
  if (!toggle || !nav) return;
  const set = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => set(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { set(false); toggle.focus(); }
  });
}

function initLanguageMemory() {
  prefs.set("scotoni-lang", html.lang);
  for (const a of $$("[data-set-lang]")) {
    a.addEventListener("click", () => prefs.set("scotoni-lang", a.dataset.setLang));
    a.href += location.hash; // keep e.g. a manage link when switching language
  }
}

function initAlert() {
  const a = hut.alert;
  const banner = $("#alert-banner");
  if (!a || !banner || !a.message) return;
  const today = zonedParts(Date.now(), "Europe/Rome").date;
  if (a.until && a.until < today) return;
  const key = `scotoni-alert-${a.type}-${a.until}-${(a.message.en || "").length}`;
  if (prefs.get(key, "sessionStorage")) return;
  const type = ["weather", "kitchen", "info"].includes(a.type) ? a.type : "info";
  const msg = a.message[html.lang] || a.message.it || "";
  const dismiss = h("button", { type: "button", class: "link-btn" }, banner.dataset.dismiss);
  dismiss.addEventListener("click", () => { banner.hidden = true; prefs.set(key, "1", "sessionStorage"); });
  clear(banner, h("strong", {}, `${banner.dataset[`label${type[0].toUpperCase()}${type.slice(1)}`]}:`), h("span", {}, msg), dismiss);
  banner.classList.toggle("is-weather", a.type === "weather");
  banner.hidden = false;
}

function initOffline() {
  if (!("serviceWorker" in navigator)) return;
  if (!(location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../sw.js").then(() => {
      for (const n of $$("[data-offline-note]")) n.hidden = false;
    }).catch(() => {});
  });
}

function initModules() {
  const names = new Set($$("[data-module]").map((el) => el.dataset.module));
  for (const name of names) {
    import(`./${name}.js`)
      .then((m) => m.init($$(`[data-module="${name}"]`)))
      .catch((err) => console.error(`[scotoni] module ${name} failed`, err));
  }
}

initTheme();
initNav();
initLanguageMemory();
initAlert();
initOffline();
initModules();
