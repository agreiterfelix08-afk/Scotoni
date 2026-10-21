// Scotoni reservations — client-side only.
// Bookings are kept in localStorage so the site works without a backend.
// To receive bookings for real, point SUBMIT_URL at a form endpoint (e.g. Formspree).

const SUBMIT_URL = "";
const STORAGE_KEY = "scotoni-reservations";
const TIME_SLOTS = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30"];
const SEATS_PER_SLOT = 40;
const MAX_DAYS_AHEAD = 120;

const form = document.getElementById("reservation-form");
const dateInput = form.elements.date;
const timeSelect = form.elements.time;
const guestsInput = form.elements.guests;
const availability = document.getElementById("availability");
const formError = document.getElementById("form-error");
const confirmation = document.getElementById("confirmation");
const confirmationText = document.getElementById("confirmation-text");
const bookingList = document.getElementById("booking-list");
const noBookings = document.getElementById("no-bookings");

function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveBookings(bookings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // Storage unavailable (private mode); bookings just won't persist.
  }
}

function toISODate(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// The hut is open June–October and December–April.
function isOpenSeason(iso) {
  const month = Number(iso.slice(5, 7));
  return month !== 5 && month !== 11;
}

function seatsTaken(date, time) {
  return loadBookings()
    .filter((b) => b.date === date && b.time === time)
    .reduce((sum, b) => sum + b.guests, 0);
}

function fillTimeSlots() {
  const date = dateInput.value;
  const previous = timeSelect.value;
  const now = new Date();
  const isToday = date === toISODate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  timeSelect.innerHTML = '<option value="">Choose a time</option>';
  for (const slot of TIME_SLOTS) {
    const [h, m] = slot.split(":").map(Number);
    const left = date ? SEATS_PER_SLOT - seatsTaken(date, slot) : SEATS_PER_SLOT;
    const past = isToday && h * 60 + m <= nowMinutes + 30;
    const opt = document.createElement("option");
    opt.value = slot;
    opt.textContent = past ? `${slot} — unavailable` : left <= 0 ? `${slot} — full` : slot;
    opt.disabled = past || left <= 0;
    timeSelect.appendChild(opt);
  }
  if (previous && !timeSelect.querySelector(`option[value="${previous}"]`).disabled) {
    timeSelect.value = previous;
  }
  updateAvailability();
}

function updateAvailability() {
  const date = dateInput.value;
  const time = timeSelect.value;
  availability.className = "availability";
  if (!date) {
    availability.textContent = "";
  } else if (!isOpenSeason(date)) {
    availability.textContent = "We're closed between seasons (May and November). Please choose another date.";
    availability.classList.add("full");
  } else if (time) {
    const left = SEATS_PER_SLOT - seatsTaken(date, time);
    availability.textContent = `${left} seats still available at ${time}.`;
    if (left < Number(guestsInput.value)) availability.classList.add("full");
  } else {
    availability.textContent = "Pick a time to check availability.";
  }
}

function validate(data) {
  const today = toISODate(new Date());
  const max = new Date();
  max.setDate(max.getDate() + MAX_DAYS_AHEAD);

  if (!data.date) return ["date", "Please choose a date."];
  if (data.date < today) return ["date", "That date is in the past."];
  if (data.date > toISODate(max)) return ["date", `We take bookings up to ${MAX_DAYS_AHEAD} days ahead.`];
  if (!isOpenSeason(data.date)) return ["date", "We're closed on that date — please pick another day."];
  if (!data.time) return ["time", "Please choose a time."];
  if (!Number.isInteger(data.guests) || data.guests < 1 || data.guests > 12) {
    return ["guests", "Online bookings are for 1 to 12 guests."];
  }
  if (SEATS_PER_SLOT - seatsTaken(data.date, data.time) < data.guests) {
    return ["time", "Not enough seats left at that time. Try another slot."];
  }
  if (!data.name) return ["name", "Please enter your name."];
  if (!/^\S+@\S+\.\S+$/.test(data.email)) return ["email", "Please enter a valid email address."];
  if (data.phone.replace(/\D/g, "").length < 6) return ["phone", "Please enter a valid phone number."];
  return null;
}

function renderBookings() {
  const today = toISODate(new Date());
  const upcoming = loadBookings()
    .filter((b) => b.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  bookingList.innerHTML = "";
  noBookings.hidden = upcoming.length > 0;
  for (const b of upcoming) {
    const li = document.createElement("li");
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${formatDate(b.date)}, ${b.time}`;
    const meta = document.createElement("div");
    meta.className = "booking-meta";
    meta.textContent = `${b.guests} guest${b.guests > 1 ? "s" : ""} · ${b.name} · Ref ${b.id}`;
    info.append(title, meta);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "link-btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      if (!confirm("Cancel this reservation?")) return;
      saveBookings(loadBookings().filter((x) => x.id !== b.id));
      renderBookings();
      fillTimeSlots();
    });

    li.append(info, cancel);
    bookingList.appendChild(li);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));

  const fd = new FormData(form);
  const data = {
    date: fd.get("date"),
    time: fd.get("time"),
    guests: Number(fd.get("guests")),
    seating: fd.get("seating"),
    name: fd.get("name").trim(),
    email: fd.get("email").trim(),
    phone: fd.get("phone").trim(),
    notes: fd.get("notes").trim(),
  };

  const problem = validate(data);
  if (problem) {
    const [field, message] = problem;
    formError.textContent = message;
    form.elements[field].classList.add("invalid");
    form.elements[field].focus();
    return;
  }
  formError.textContent = "";

  const booking = {
    ...data,
    id: Math.random().toString(36).slice(2, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
  };

  if (SUBMIT_URL) {
    try {
      const res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(booking),
      });
      if (!res.ok) throw new Error(res.statusText);
    } catch {
      formError.textContent = "We couldn't send your reservation. Please try again or call us.";
      return;
    }
  }

  saveBookings([...loadBookings(), booking]);

  confirmationText.textContent =
    `${data.name}, your table for ${data.guests} on ${formatDate(data.date)} at ${data.time} is reserved. ` +
    `Your reference is ${booking.id}.`;
  form.hidden = true;
  confirmation.hidden = false;
  form.reset();
  renderBookings();
  fillTimeSlots();
});

document.getElementById("new-booking").addEventListener("click", () => {
  confirmation.hidden = true;
  form.hidden = false;
  setDateBounds();
  fillTimeSlots();
});

function setDateBounds() {
  const today = new Date();
  const max = new Date();
  max.setDate(max.getDate() + MAX_DAYS_AHEAD);
  dateInput.min = toISODate(today);
  dateInput.max = toISODate(max);
}

dateInput.addEventListener("change", fillTimeSlots);
timeSelect.addEventListener("change", updateAvailability);
guestsInput.addEventListener("input", updateAvailability);

document.getElementById("year").textContent = new Date().getFullYear();
setDateBounds();
fillTimeSlots();
renderBookings();
