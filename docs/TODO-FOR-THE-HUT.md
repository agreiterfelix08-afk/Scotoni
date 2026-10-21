# To do for the hut: real data needed

Everything below is a placeholder or unknown today. **Nothing on the site was guessed**: unknown
values are empty, marked "to be confirmed", or labelled "demo". Almost all of them live in
**one file: `src/data/hut.config.js`**. After changing it, run `npm run build` (or ask Felix).

## 1. Facts about the hut (`hut` in `src/data/hut.config.js`)

| What | Today | Notes |
|---|---|---|
| **Altitude** | `2040` (shown with "to be confirmed") | Sources disagree: **1,985 m** (restaurant guide, trekking sites), **1,998 m** (Alta Badia tourism board), **2,040 m** (Planetmountain, our Instagram). Note: Capanna Alpina 1,720 m + ~320 m ascent ≈ 2,040 m. Set `altitudeM`, then `altitudeVerified: true` to remove the "to be confirmed" note. |
| Postcode | empty | Probably 39036 (Badia/San Cassiano). Confirm. |
| **Phone** | empty (hidden everywhere) | Shown in the footer, contact section and JSON-LD once set. |
| WhatsApp | empty | Optional, international format without "+", e.g. `39333…`. Adds a "send via WhatsApp" button after booking. |
| Official website/domain | `www.scotoni.it` | Was not reachable when the site was built. Confirm. Also `site.baseUrl` if the site moves to its own domain. |
| **Opening season** | empty | Exact opening and closing dates; is there **winter operation**? Format `[{ from: "06-15", to: "10-15" }]`. |
| **Opening hours** | empty | Per weekday, e.g. `{ 1: ["09:00", "17:00"] }`. Until set, the status strip says "to be confirmed". |
| Rest day / closed dates | none | `closedWeekdays`, `closedDates`. |
| Alert banner | off | For "kitchen closes early" or "weather alert": set `alert` (texts in IT/DE/EN). |
| Menu prices | none (hidden) | `prices: { "mixed-grill": 24, … }`. Ids are in `src/data/menu.js`. |
| Reviews link | none | Link to a real review page (Google Maps, Tripadvisor). No reviews are written on the site. |
| Instagram | none | Profile URL. |

## 2. Menu and wine

| What | File | Notes |
|---|---|---|
| Confirm the dishes | `src/data/menu.js` | Only verified dishes are listed: mixed grill, ribs, sausages, grilled vegetables, goulash soup, home-made pasta, polenta with melted cheese, speck and cheese, Kaiserschmarrn, strudel, cakes and tarts. |
| **Dietary tags** | `src/data/menu.js` | "Vegetarian" on grilled vegetables and polenta is provisional. **No dish is tagged gluten-free** until the kitchen says which ones are (allergen information is a legal matter). |
| **Wine list (~700 labels)** | `scripts/wines-from-csv.mjs` | Export the spreadsheet as CSV (columns: name, producer, region, country, colour, grape, vintage, priceBand 1–4, price) and run the script. Until then the explorer shows labelled demo wines. |

## 3. Photos

`src/data/gallery.js`. The gallery shows illustrations labelled "placeholder". For each real photo:
export **480, 960 and 1600 px wide** as `.avif`, `.webp` and `.jpg` into `assets/photos/`
(e.g. `grill-480.avif`, `grill-960.webp`, `grill-1600.jpg`) and set `photo` on the item.
Ideas: the grill with Christian, the terrace, a room, the alpacas, the trail, the chapel, Kaiserschmarrn.

## 4. Getting here

| What | File | Notes |
|---|---|---|
| Parking at Capanna Alpina | `src/i18n/*.js` (`trail.parking`), `src/data/trail.js` | The site only says "check parking options and fees locally". Add real info (fees, summer road rules, shuttle). |
| Alpaca rules | `src/i18n/*.js` (`family.rules_note`) | Today: "please ask our staff". Can guests feed or touch them? |
| Alpaca names | – | The cards show general alpaca facts only. If you want, add their names. |

## 5. Rooms

Number and type of rooms (private vs shared bathroom), prices, and whether you want an enquiry
endpoint (`site.forms.roomEnquiryEndpoint`, e.g. Formspree). Today the form opens the guest's email app.

## 6. Table reservations (decide with Christian; `reservations` in the config)

| What | Example in the prototype |
|---|---|
| **Table plan**: tables per zone, seats, which can be pushed together, covered terrace tables | stube 7 tables / 32 seats, terrace 8 / 32, reserved area 3 / 14 |
| **Seating times** | 11:30 – 14:00 every 30 min |
| Time per table | 90 min (≤ 4 people), 120 min (5+) |
| **Share bookable online** per zone | stube 60 %, terrace 50 % |
| Walk-in seats released at | 10:30 |
| Peak times | 12:00, 12:30, 13:00 |
| Booking window / same-day cut-off | 60 days / 11:00 |
| Free cancellation | 24 h |
| Group request from | 9 people; online maximum 16 |
| Deposit after | 2 no-shows or late cancellations; **amount: to decide** |
| **Reserved area: is there one, which tables, which model** | minimum spend; **amount: to decide** (demo shows € 40, labelled "demo value") |
| Data retention | 12 months |

## 7. Before going live

- [ ] Real backend (see `docs/TECHNICAL.md`). Until then bookings exist only in the browser of the guest.
- [ ] Real staff login (the prototype PINs `1111` staff / `2222` owner are **not** security).
- [ ] Email provider for confirmations.
- [ ] Payment provider, only if you choose deposits.
- [ ] Review the privacy notice (`privacy.*` in `src/i18n/*.js`) with whoever handles your GDPR matters.
- [ ] Set `reservations.demo = false`.

## 8. Ega Scotoni

**What is "Ega Scotoni"?** Nothing public describes it, so the site has a placeholder page and a
homepage teaser marked "draft". Once you tell us what it is, change `src/features/ega-scotoni/data.js`
(texts in IT/DE/EN), or switch it off with `features.egaScotoni = false`. Ladin: is "ega" Ladin here,
and should the page also get a Ladin text?
