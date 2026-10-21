# Rifugio Scotoni: website and table reservations

Website of Rifugio Scotoni (Alta Badia, Dolomites) in Italian, German and English, with a working
prototype of a fair table reservation system.

- **Live site (GitHub Pages):** https://agreiterfelix08-afk.github.io/Scotoni/
- **Book a table:** `/it/reserve.html` · **Staff dashboard:** `/it/admin.html` (prototype PINs: staff `1111`, owner `2222`)

## For the hut

| Document | What it is |
|---|---|
| [docs/RESERVATIONS.md](docs/RESERVATIONS.md) | How the booking rules work, in plain language, with a Saturday example. Includes a short version for guests. |
| [docs/TODO-FOR-THE-HUT.md](docs/TODO-FOR-THE-HUT.md) | Every value we still need from you (altitude, hours, tables, prices, photos, Ega Scotoni …). |
| [docs/REVIEW.md](docs/REVIEW.md) | Audit of the first version and what was fixed. |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Architecture, commands, how to connect a real backend. |

Almost everything you'll want to change is in **`src/data/hut.config.js`**.

## Showing the reservation system in a meeting

1. Open `/de/admin.html` (or `/it/`, `/en/`), log in with a name and PIN `2222`.
2. Pick a day and click **Load demo day**.
3. Show the timeline, then switch **Weather → Rain: terrace closed** and look at the list of affected bookings.
4. In another tab, book a table on `/de/reserve.html` for the same day. It appears in the dashboard straight away.
5. Make a phone booking with "override": it asks for a reason, and the reason shows up in the audit log.

The prototype keeps all data in the browser, so it works offline, but bookings made on one device
are not visible on another. See "Before going live" in the to-do file.

## Development

Requires Node 22+. No dependencies to install.

```sh
npm run build   # regenerate it/ de/ en/ from src/
npm run check   # build + lint + tests
npm run serve   # http://localhost:8000
```

The pages in `it/`, `de/`, `en/` are generated: edit `src/`, then run `npm run build` and commit both.
