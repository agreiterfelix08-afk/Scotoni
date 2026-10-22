// Room enquiry (separate from table booking). Sends to an endpoint if configured,
// otherwise opens the guest's email app with the enquiry filled in.
import { hut, site } from "../data/hut.config.js";
import { zonedParts } from "../reservation-engine/time.js";
import { clearErrors, isEmail, showErrors } from "./forms.js";
import { prefs } from "./dom.js";
import { loadDict, t, TZ } from "./i18n.js";

export async function init([root]) {
  await loadDict();
  const form = root.querySelector("[data-rooms-form]");
  const result = form.querySelector("[data-form-result]");
  const today = zonedParts(Date.now(), TZ).date;
  form.elements.arrival.min = today;
  form.elements.departure.min = today;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    result.textContent = "";
    const f = form.elements;
    if (f.website.value) return; // honeypot: silently ignore bots
    const errors = {};
    if (!f.arrival.value) errors.arrival = "required";
    if (!f.departure.value) errors.departure = "required";
    else if (f.arrival.value && f.departure.value <= f.arrival.value) errors.departure = "invalid_date_range";
    if (!(Number(f.guests.value) >= 1)) errors.guests = "invalid_party";
    if (f.name.value.trim().length < 2) errors.name = "invalid_name";
    if (!isEmail(f.email.value)) errors.email = "invalid_email";
    if (!f.consent.checked) errors.consent = "consent_required";
    if (Object.keys(errors).length) return showErrors(form, errors);
    clearErrors(form);

    const last = Number(prefs.get("scotoni-enquiry-at", "sessionStorage") || 0);
    if (Date.now() - last < 30000) {
      result.className = "form-result is-error";
      result.textContent = t("err.rate_limited");
      return;
    }
    prefs.set("scotoni-enquiry-at", String(Date.now()), "sessionStorage");

    const data = {
      arrival: f.arrival.value, departure: f.departure.value, guests: Number(f.guests.value),
      room: f.room.value, board: f.board.value, name: f.name.value.trim(), email: f.email.value.trim(),
      message: f.message.value.trim().slice(0, 1000), lang: document.documentElement.lang,
    };
    const endpoint = site.forms.roomEnquiryEndpoint;
    if (endpoint) {
      try {
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error(String(res.status));
        result.className = "form-result is-ok";
        result.textContent = t("rooms.sent");
        form.reset();
      } catch {
        result.className = "form-result is-error";
        result.textContent = t("rooms.error");
      }
      return;
    }
    const roomLabel = f.room.selectedOptions[0].textContent;
    const boardLabel = f.board.selectedOptions[0].textContent;
    const body = [
      `${t("rooms.arrival")}: ${data.arrival}`, `${t("rooms.departure")}: ${data.departure}`,
      `${t("rooms.guests")}: ${data.guests}`, `${t("rooms.room_type")}: ${roomLabel}`, `${t("rooms.board_label")}: ${boardLabel}`,
      "", data.message, "", `${data.name} <${data.email}>`,
    ].join("\n");
    const subject = t("rooms.mail_subject", { arrival: data.arrival, departure: data.departure });
    window.location.href = `mailto:${hut.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    result.className = "form-result is-ok";
    result.textContent = t("rooms.sent_mail");
  });
}
