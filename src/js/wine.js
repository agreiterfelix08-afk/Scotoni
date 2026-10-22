// Wine list explorer: search + filters over ~700 labels, rendered in chunks as you scroll
// so a weak phone on a weak connection never builds 700 rows at once.
import { loadWines } from "../data/wines.js";
import { h, clear } from "./dom.js";
import { loadDict, t, formatMoney } from "./i18n.js";

const CHUNK = 40;
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function init([root]) {
  await loadDict();
  const form = root.querySelector("[data-wine-filters]");
  const list = root.querySelector("[data-wine-list]");
  const count = root.querySelector("[data-wine-count]");
  const sentinel = root.querySelector("[data-wine-sentinel]");
  const { wines, demo } = await loadWines();
  root.querySelector("[data-wine-demo]").hidden = !demo;

  const regions = [...new Set(wines.map((w) => w.region))].sort((a, b) => a.localeCompare(b));
  form.elements.region.append(...regions.map((r) => h("option", { value: r }, r)));
  const index = wines.map((w) => ({ w, text: norm(`${w.name} ${w.producer} ${w.grape} ${w.region}`) }));

  let results = [];
  let rendered = 0;

  const row = (w) => h("li", { class: "wine" },
    h("span", { class: `wine-swatch ${w.colour}`, "aria-hidden": "true" }),
    h("span", { class: "wine-name" }, w.name),
    h("span", { class: "wine-price" }, w.price != null ? formatMoney(w.price) : "€".repeat(w.priceBand)),
    h("span", { class: "wine-meta" }, [w.producer, w.region, t(`colour.${w.colour}`), w.grape, w.vintage ?? t("wine.nv")].filter(Boolean).join(" · ")),
  );

  const renderMore = () => {
    const next = results.slice(rendered, rendered + CHUNK);
    list.append(...next.map(row));
    rendered += next.length;
  };

  const apply = () => {
    const q = norm(form.elements.q.value.trim());
    const region = form.elements.region.value;
    const colour = form.elements.colour.value;
    const price = form.elements.price.value;
    results = index
      .filter((e) => (!q || e.text.includes(q)) && (!region || e.w.region === region) && (!colour || e.w.colour === colour) && (!price || String(e.w.priceBand) === price))
      .map((e) => e.w);
    clear(list);
    rendered = 0;
    renderMore();
    count.textContent = results.length ? t("wine.results", { n: results.length }) : t("wine.none");
  };

  let timer;
  form.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(apply, 150); });
  form.addEventListener("reset", () => setTimeout(apply, 0));
  form.addEventListener("submit", (e) => e.preventDefault());

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && rendered < results.length) renderMore();
    }, { rootMargin: "600px" }).observe(sentinel);
  }
  apply();
}
