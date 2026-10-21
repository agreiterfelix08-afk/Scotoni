# Rifugio Scotoni website — audit

Reviewed: `main` at `5c57838` (the first version of the site, three files).
Reviewer stance: strict but constructive. Every finding has a severity, a location,
why it matters, and a fix. The **Status** column says what happened to it in the
upgrade on branch `claude/scotoni-reservation-website-oxj4ea`.

> Honesty note: the first version was generated in an earlier step without access
> to verified facts. Most content findings below are claims that were **invented**
> at the time. They are flagged as such, not softened.

## Phase 0 — inventory

| Item | Finding |
|---|---|
| Framework | None. Plain HTML + CSS + one classic script. |
| Build / lint / test | None exist. No `package.json`, no test runner, no linter. Nothing to run, nothing fails, nothing is checked. |
| Pages | 1 (`index.html`), English only, sections: hero, about, menu, hours, reserve. |
| Components | None (one monolithic page). |
| Data sources | Hard-coded copy in HTML; booking constants hard-coded at the top of `script.js`; bookings in `localStorage` key `scotoni-reservations`. |
| Form handling | Client-side only. Optional `SUBMIT_URL` POST (empty, so nothing is sent anywhere). |
| External dependencies | Google Fonts (Fraunces, Inter), one Unsplash hero photo. |
| "Ega Scotoni" | `grep -ri ega` finds nothing. No Ladin copy anywhere in the project. Public web search finds nothing either. Implemented as a removable placeholder module (see summary). |
| Official site | `scotoni.it` / `www.scotoni.it` did not resolve (DNS) from the review environment, so the brief's verified facts are the reference. |
| Repo history | A `CNAME` (`scotonireservations.it`) was added and deleted on `main`; GitHub Pages currently serves from the default `github.io` URL. |

Baseline Lighthouse (mobile, simulated slow 4G): **Performance 88 · Accessibility 100 · Best Practices 96 · SEO 100**.
The Accessibility/SEO 100 is misleading: Lighthouse only checks a subset (see sections 4 and 6).

## Summary table

| # | Area | Severity | Title | Status |
|---|---|---|---|---|
| C1 | Correctness | critical | Bookings never reach the hut | Fixed (engine + store interface + clear prototype labelling) |
| C2 | Correctness | high | Capacity is a single seat counter; tables, dwell time and party packing are ignored | Fixed (reservation engine) |
| C3 | Correctness | high | Read-modify-write race: two tabs can over-book | Fixed (serialised transactions) |
| C4 | Correctness | medium | Dates computed in the device time zone, not Europe/Rome | Fixed |
| C5 | Correctness | medium | Cancel uses `window.confirm` and works for anyone on the device; no manage link | Fixed |
| C6 | Correctness | low | `querySelector` built from user-controllable value | Fixed (code removed) |
| C7 | Correctness | low | Weak booking reference (`Math.random`, 6 chars) | Fixed (`crypto.getRandomValues`) |
| K1 | Content | critical | Altitude 2,040 m stated as fact; sources disagree | Fixed (single config constant + TODO) |
| K2 | Content | critical | Invented opening seasons, winter season and kitchen hours | Fixed (moved to config, `null` + TODO, UI says "to be confirmed") |
| K3 | Content | high | Invented menu items | Fixed (only verified dishes) |
| K4 | Content | high | Invented access info ("ski down from lifts", "evening dinners") | Fixed (verified trail from Capanna Alpina) |
| K5 | Content | high | Stock photo presented as the hut | Fixed (removed; illustrated placeholders labelled as such) |
| K6 | Content | high | Invented capacity (40 seats per slot, 12 guests online) | Fixed (config, TODO) |
| K7 | Content | medium | Missing verified facts (Agreiter family, grill, 700 wines, rooms, alpacas, nature park) | Fixed |
| K8 | Content | medium | Brand name "Scotoni" without "Rifugio"; no address or contact | Fixed |
| I1 | Interactivity | medium | Menu, hours, access are static text | Fixed |
| I2 | Interactivity | medium | No language switch, no gallery, no rooms enquiry | Fixed |
| A1 | Accessibility | high | Errors not tied to fields (`aria-describedby`, `aria-invalid`) | Fixed |
| A2 | Accessibility | medium | Mobile nav hides all section links | Fixed |
| A3 | Accessibility | medium | No skip link; sticky header covers anchored headings | Fixed |
| A4 | Accessibility | medium | `scroll-behavior: smooth` ignores `prefers-reduced-motion` | Fixed |
| A5 | Accessibility | medium | Focus style only on inputs; links/buttons rely on browser default | Fixed |
| A6 | Accessibility | low | Hours table without `<caption>`/scope; small touch target on "Cancel" | Fixed |
| A7 | Accessibility | low | `--muted` on `--bg-alt` is close to the 4.5:1 limit | Fixed (darker token) |
| P1 | Performance | high | Render-blocking Google Fonts (2 families, 5 weights) | Fixed (system font stacks, 0 font bytes) |
| P2 | Performance | high | ~250 KB hero photo from a third-party CDN, no `srcset`, CSS background (not discoverable, not lazy) | Fixed (inline SVG, < 3 KB) |
| P3 | Performance | medium | No caching or offline support for a site used at altitude | Fixed (service worker, offline-first) |
| P4 | Performance | low | No `width`/`height` on media, no lazy loading strategy | Fixed |
| S1 | SEO | high | No structured data (Restaurant / LodgingBusiness) | Fixed (JSON-LD) |
| S2 | SEO | high | Title "Scotoni — Reservations" misses the brand and place | Fixed |
| S3 | SEO | medium | No canonical, Open Graph, `hreflang`, sitemap, robots | Fixed |
| L1 | i18n | high | English only, all strings hard-coded in HTML/JS | Fixed (IT/DE/EN, pre-rendered per language) |
| G1 | Privacy | high | No privacy notice, no purpose, no retention for personal data | Fixed (notice + retention purge + delete on request) |
| G2 | Security | medium | No spam protection; no server-side style validation | Fixed (honeypot, rate limit, engine validation) |
| G3 | Privacy | low | Third-party requests (Google Fonts, Unsplash) leak IPs before any consent | Fixed (no third-party requests) |
| Q1 | Quality | medium | All config hard-coded in `script.js`; logic mixed with DOM | Fixed (config file, DOM-free engine) |
| Q2 | Quality | medium | No tests | Fixed (Node test runner, engine coverage ≥ 90%) |
| Q3 | Quality | low | Inline style duplication, no CSS layering/tokens for theme | Fixed |

Everything critical and high is fixed. Deliberately left for later is listed at the end.

---

## 1. Correctness and bugs

**C1 — critical — `script.js:5`, `script.js:191-205`. Bookings never reach the hut.**
`SUBMIT_URL` is empty, so a "confirmed" reservation lives only in the guest's own browser.
The guest sees "your table is reserved" while the hut knows nothing. This is worse than
no form: it creates guaranteed angry guests at the door.
*Fix:* separate the booking rules (engine) from storage behind a `ReservationStore`
interface; ship a `LocalStorageStore` for the offline prototype and a documented backend
adapter; label the prototype clearly on the booking page ("demo — bookings are stored
in this browser only") until the backend is switched on.

**C2 — high — `script.js:7-8`, `script.js:55-59`. Capacity model is a single counter.**
Seats are summed per time slot (`SEATS_PER_SLOT = 40`) regardless of tables, zones or how
long people stay. A 12:00 party of 6 does not block 12:30, so the hut is over-booked by
design; ten parties of 4 fill "40 seats" even if there are only six 4-tops.
*Fix:* table-level allocation with dwell time and smallest-fit packing (`reservation-engine`).

**C3 — high — `script.js:205`. Lost-update race.**
`saveBookings([...loadBookings(), booking])` after an `await fetch` re-reads state late but
validates early (`validate` at line 175). Two tabs/guests can both pass the capacity check.
*Fix:* all writes go through a serialised `store.transaction()`; the engine re-checks
availability inside the transaction. The backend adapter documents a unique constraint.

**C4 — medium — `script.js:37-40`, `script.js:63-66`. Wrong time zone.**
"Today" and the past-slot cut-off use the device clock and zone. A guest in London
(UTC+0/+1) can book a slot that already started in South Tyrol.
*Fix:* all scheduling in `Europe/Rome`; ISO strings with offset; DST tests.

**C5 — medium — `script.js:148`. Cancellation.**
Anyone with the device can cancel; there is no way to cancel from another device; blocking
`window.confirm` is not localisable.
*Fix:* unguessable manage token in the URL fragment (not sent to servers, not personal data),
accessible in-page confirmation.

**C6 — low — `script.js:79`.** Selector built with a template string from a form value. Not
exploitable here (value comes from our own `<option>`), but a pattern to avoid. Removed.

**C7 — low — `script.js:187`.** `Math.random().toString(36)` references can collide and are
guessable. Replaced with `crypto.getRandomValues`.

No broken links or console errors from our own code. One console error comes from the
blocked Unsplash request (see P2).

## 2. Content accuracy (against the brief's verified facts)

**K1 — critical — `index.html:42`.** "2,040 m" stated as fact. Sources say 1,985 / 1,998 / 2,040 m.
*Fix:* `hut.altitudeM` in `src/data/hut.config.js`, one constant used everywhere, with the
three source values recorded next to it and a `TODO: verify`. Default 2,040 m only because
it matches the Instagram caption already published; **Felix must confirm** (see TODO file).

**K2 — critical — `index.html:74-77`, `script.js:49-53`.** "Summer June–October, Winter
December–April, Kitchen 11:30–15:30, closed May/November" — all invented. Winter operation
is not verified at all.
*Fix:* `seasons` and `openingHours` are `null` with TODO; the status strip shows
"opening times to be confirmed — please check with us" until they are filled.

**K3 — high — `index.html:55-63`.** Invented dishes: "spinach canederli, schlutzkrapfen,
tagliatelle with venison ragù, cranberry jam, krapfen, pork and beef".
*Fix:* menu built only from the verified list (mixed grill, ribs, sausages, grilled vegetables,
goulash soup, home-made pasta, polenta with melted cheese, strudel, cakes, tarts, jams,
Kaiserschmarrn, in-house speck). Dietary tags marked `TODO: verify`.

**K4 — high — `index.html:38`, `index.html:82`.** "Reachable by bike / on skis", "ski down from
nearby lifts", "evening dinners for groups" — not verified.
*Fix:* replaced with the verified hike (Capanna Alpina, trail 20, ~1 h, ~320 m).

**K5 — high — `styles.css:83`.** Generic Unsplash mountain photo shown as if it were the hut.
*Fix:* removed. Illustrated, clearly labelled placeholders until real photos are supplied.

**K6 — high — `script.js:8`, `index.html:90`.** "40 seats", "up to 12 guests online" — invented.
*Fix:* capacity, tables and group threshold in config, all `TODO`.

**K7 — medium.** Verified facts that were missing: Agreiter family > 50 years, Christian at the
grill, open grill kitchen in view, ~700 wines, local ingredients (Puster Valley potatoes,
South Tyrolean cheese and cured meats, in-house speck), gluten-free cuisine, ~20 beds,
larch-wood rooms for 4–6, half board / breakfast, playground, alpaca park, Fanes-Sennes-Braies
Nature Park (UNESCO), surrounding peaks, WWI chapel, Lago Lagazuoi extension. Added.

**K8 — medium — `index.html:6`, `index.html:146`.** The hut is "Rifugio Scotoni"; no address
(Alpe Lagazuoi 2, San Cassiano), no email (info@scotoni.it). Added. Phone not verified → TODO.

## 3. Interactivity

**I1 — medium.** Menu, hours, and "getting here" are static paragraphs. Replaced with a
filterable menu, a live open/closed status strip with alert banner, and an interactive trail card.

**I2 — medium.** Missing: language switch, gallery, rooms enquiry, family corner, wine list.
Added (keyboard-accessible lightbox with swipe, persisted language, enquiry form, alpaca cards,
lazy-rendered wine explorer).

Fragile interactivity in the old version: the booking form (C1–C5); the "Your reservations"
list trusts whatever is in `localStorage` (no schema check).

## 4. Accessibility (WCAG 2.2 AA)

**A1 — high — `index.html:126`, `script.js:178-180`.** One generic error paragraph; the field is
highlighted by colour only (1.4.1) and the message is not programmatically associated (3.3.1, 1.3.1).
*Fix:* per-field error elements, `aria-invalid`, `aria-describedby`, error summary with links, focus
moves to the first invalid field.

**A2 — medium — `styles.css` `@media (max-width:760px)`.** All nav links are `display:none` on
mobile; only "Book a table" remains, so mobile users cannot reach Menu/Hours from the header.
*Fix:* accessible disclosure menu (button with `aria-expanded`).

**A3 — medium.** No skip link (2.4.1). The sticky header overlaps headings after anchor jumps
(2.4.11 Focus Not Obscured, new in 2.2). *Fix:* skip link + `scroll-padding-top` matching the header height.

**A4 — medium — `styles.css` `html { scroll-behavior: smooth }`.** Ignores
`prefers-reduced-motion` (2.3.3 is AAA, but it is cheap and the new site has more motion).
*Fix:* motion only inside `@media (prefers-reduced-motion: no-preference)`.

**A5 — medium.** Only inputs have a visible custom focus style; the pill buttons' default ring
is hard to see on the accent background (2.4.7). *Fix:* global `:focus-visible` ring with offset.

**A6 — low.** Hours table lacks `<caption>` and `scope`; the "Cancel" link-button is ~20 px
high (2.5.8 Target Size minimum 24 px). *Fix:* table semantics, ≥ 44 px targets.

**A7 — low.** `--muted #6f655d` on `--bg-alt #f0ebe2` ≈ 4.9:1 — passes, but with little margin
for the smaller meta text. Tokens adjusted; every text/background token pair measures ≥ 5.3:1 in both themes.

Heading order, landmarks (`header/nav/main/footer`) and labels were already correct.

## 5. Performance on mountain connections

**P1 — high — `index.html:8-10`.** Google Fonts CSS is render-blocking and pulls two more
origins; on slow 4G that is the main reason FCP is 2.9 s. *Fix:* system font stacks
(serif: Iowan Old Style / Palatino / Georgia; sans: system-ui). 0 KB of fonts.

**P2 — high — `styles.css:83`.** ~250 KB third-party JPEG as a CSS background: not preloadable,
no responsive sizes, and it fails entirely when the CDN is blocked (the console error).
*Fix:* inline SVG landscape (< 3 KB), themable for day/night.

**P3 — medium.** No caching headers we control (GitHub Pages: 10 min) and nothing offline.
*Fix:* service worker: cache-first for versioned assets, network-first with offline fallback
for pages. The booking prototype works fully offline.

**P4 — low.** Gallery/real photos will need `width`/`height`, `srcset`, `loading="lazy"`,
AVIF/WebP. The gallery component supports this; `docs/TODO-FOR-THE-HUT.md` explains the export sizes.

JS weight was fine (5 KB). The new site keeps per-page JS small and loads modules only where used
(wine list data and admin code are never loaded on the homepage).

## 6. SEO and local discovery

**S1 — high.** No JSON-LD. A mountain hut lives on map and "rifugio near Lagazuoi" searches.
*Fix:* `["Restaurant","LodgingBusiness"]` JSON-LD with address, geo, email, `servesCuisine`,
`containedInPlace` (nature park), opening hours **only when configured**.

**S2 — high — `index.html:6-7`.** Title/description lack brand ("Rifugio Scotoni"), place
(Alta Badia, San Cassiano, Lagazuoi) and language variants. Fixed per page and language.

**S3 — medium.** No canonical, OG/Twitter tags, `hreflang`, `sitemap.xml`, `robots.txt`. Added;
admin and booking-manage pages are `noindex`.

## 7. Internationalisation

**L1 — high.** Everything is English and hard-coded. The audience is Italian, German and English
(Ladin locally).
*Fix:* dictionaries `src/i18n/{it,de,en}.js` with identical key sets (lint-enforced). Pages are
**pre-rendered per language** (`/it/`, `/de/`, `/en/`) by `npm run build`, so each language has a
real URL, real `hreflang`, and works without JS. Root `/` picks the saved or browser language.
Italian is the default (`x-default`). Ladin: structure supports adding `lld`; no Ladin copy was
written because we cannot verify it (TODO).

## 8. Security and privacy

**G1 — high.** Personal data (name, email, phone, notes) collected with no purpose statement,
no retention, no deletion route. *Fix:* privacy notice in all languages; retention purge
(default 12 months, configurable) that anonymises bookings; delete-on-request in the admin.

**G2 — medium.** No honeypot, no rate limit, only client-side checks. *Fix:* engine-level
validation (runs the same on a server), honeypot field, per-email/IP rate limit.

**G3 — low.** Third-party requests to Google and Unsplash before consent (cf. the 2022 Munich
ruling on Google Fonts). *Fix:* no third-party requests at all; no analytics.

XSS: the old code already used `textContent` for user data — good; the new code keeps that rule
(lint check for `innerHTML` with interpolation).

## 9. Code quality

**Q1 — medium.** Configuration constants and copy live in code. *Fix:* `src/data/hut.config.js`
is the single place the hut edits. The engine is DOM-free and receives config, store, clock,
notifier and payment provider by injection.

**Q2 — medium.** No tests. *Fix:* `node --test` (built into Node, no dependency) with coverage.

**Q3 — low.** One flat stylesheet; dark mode duplicates every token. *Fix:* token layer +
component layer, `data-theme` override for the day/night toggle.

---

## Results after the upgrade

Measured on the rebuilt site (Lighthouse 12, mobile, simulated slow 4G, gzip as on GitHub Pages):

| Page | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `it/index.html` | 100 | 100 | 100 | 100 | 1.0 s | 0.002 |
| `it/reserve.html` | 100 | 100 | 100 | 100 | 1.3 s | 0.012 |
| `en/wine.html` | 100 | 100 | 100 | 100 | 1.2 s | 0 |
| `de/ega-scotoni.html` | 100 | 100 | 100 | 100 | 1.2 s | 0 |

Remaining Lighthouse hints: cache lifetime of GitHub Pages (10 min; not configurable there,
mitigated by the service worker) and ~5 KB of unminified JS (deliberately not minified: no build
dependency, readable source).

Engine tests: 57 passing; coverage of `src/reservation-engine`: 100 % lines, 91 % branches,
98.6 % functions. Lint: syntax, IT/DE/EN key and placeholder parity, built-HTML checks, safety rules.

## What was fixed vs. left for later

All critical, high and cheap medium findings are fixed. Deliberately **left for later**:

1. **Real backend.** The `SqliteStore` adapter and HTTP API are documented stubs. Until they are
   deployed, online bookings only exist in the browser that made them. The booking page says so.
2. **Real authentication for the admin.** The prototype uses role PINs from config. This is not
   security; it must be replaced by server-side auth before real use.
3. **Real email and payment providers.** Interfaces and console/demo stubs only.
4. **Real photos.** Placeholders are illustrated and labelled.
5. **Ladin translation.** Needs a native speaker.
6. **Full 700-label wine list.** A labelled demo dataset with the final structure, plus a CSV
   import script.
7. **Cookie/consent banner.** Not needed today because nothing tracks; required as soon as any
   analytics or embedded maps are added.
