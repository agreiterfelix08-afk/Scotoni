// Ega Scotoni — component. Renders the homepage teaser and the page body.
// Used by the build (pre-rendered HTML); has no runtime dependencies.
// To remove the feature: set `features.egaScotoni = false` in src/data/hut.config.js.

import { ega } from "./data.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const egaNavLabel = (lang) => ega.text[lang].nav;
export const egaMeta = (lang) => ({ title: `${ega.title} – Rifugio Scotoni`, description: ega.text[lang].metaDescription });

export function renderEgaTeaser(lang) {
  const t = ega.text[lang];
  return `<section class="section ega-teaser" aria-labelledby="ega-teaser-title">
  <div class="container ega-teaser-inner">
    <p class="eyebrow">${esc(t.kicker)}</p>
    <h2 id="ega-teaser-title">${esc(ega.title)}</h2>
    <p>${esc(t.teaser)}</p>
    <a class="btn btn-ghost" href="${ega.slug}.html">${esc(t.cta)}</a>
  </div>
</section>`;
}

export function renderEgaPage(lang) {
  const t = ega.text[lang];
  const blocks = t.blocks.map((b) => `<li class="card"><h2>${esc(b.title)}</h2><p>${esc(b.body)}</p></li>`).join("\n      ");
  return `<main id="main" class="section ega-page">
  <div class="container">
    <p class="eyebrow">${esc(t.kicker)}</p>
    <h1>${esc(ega.title)}</h1>
    ${ega.draft ? `<p class="note demo-note">${esc(t.draft)}</p>` : ""}
    <p class="section-lead">${esc(t.intro)}</p>
    <ul class="cards ega-blocks">
      ${blocks}
    </ul>
  </div>
</main>`;
}
