# Scotoni

Reservation website for Scotoni, a mountain hut restaurant in the Dolomites.

Static site (plain HTML/CSS/JS, no build step):

- `index.html` – landing page (about, menu, hours) and booking form
- `styles.css` – styles, including dark mode and mobile layout
- `script.js` – reservation logic

## Features

- Lunch time slots (11:30–14:30) with per-slot seat capacity
- Validation: no past dates, bookings up to 120 days ahead, 1–12 guests, closed in May and November
- Confirmation with a booking reference, plus a "Your reservations" list with cancel

## Run locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Receiving real bookings

Bookings are currently stored only in the visitor's browser (`localStorage`).
To have them sent to you, set `SUBMIT_URL` at the top of `script.js` to a form
endpoint (for example a Formspree form URL); each booking is POSTed as JSON.

Capacity (`SEATS_PER_SLOT`), time slots (`TIME_SLOTS`) and booking window
(`MAX_DAYS_AHEAD`) are configured at the top of `script.js`.
