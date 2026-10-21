// Gallery lightbox: <dialog> (focus trap and Esc for free), arrow keys, swipe on touch screens.
import { h, clear } from "./dom.js";
import { loadDict, t } from "./i18n.js";

export async function init([root]) {
  await loadDict();
  const items = [...root.querySelectorAll(".gallery-item")];
  const dialog = root.querySelector("[data-lightbox]");
  const figure = dialog.querySelector("[data-lightbox-figure]");
  const counter = dialog.querySelector("[data-lightbox-counter]");
  let index = 0;

  const show = (i) => {
    index = (i + items.length) % items.length;
    const item = items[index];
    const media = item.querySelector("svg, picture").cloneNode(true);
    const img = media.querySelector?.("img");
    if (img) { img.loading = "eager"; img.alt = item.dataset.alt; img.sizes = "96vw"; }
    else { media.setAttribute("role", "img"); media.setAttribute("aria-label", item.dataset.alt); media.removeAttribute("aria-hidden"); }
    clear(figure, media, h("figcaption", {}, item.dataset.caption));
    counter.textContent = t("gallery.counter", { i: index + 1, n: items.length });
  };

  items.forEach((btn, i) => btn.addEventListener("click", () => { show(i); dialog.showModal(); }));
  dialog.querySelector("[data-lightbox-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-lightbox-prev]").addEventListener("click", () => show(index - 1));
  dialog.querySelector("[data-lightbox-next]").addEventListener("click", () => show(index + 1));
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });
  dialog.addEventListener("close", () => items[index].focus());

  let startX = null;
  dialog.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") startX = e.clientX; });
  dialog.addEventListener("pointerup", (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
}
