// Guest booking flow: 3 steps, no account, works offline in the prototype.
// All rules live in the engine; this file only collects input and shows results.
import { hut } from "../data/hut.config.js";
import { toICS } from "../reservation-engine/ics.js";
import { addDays, isValidDate, zonedParts } from "../reservation-engine/time.js";
import { validateGuest } from "../reservation-engine/validation.js";
import { engine, config } from "./engine-setup.js";
import { h, clear, download, $, $$ } from "./dom.js";
import { clearErrors, showErrors } from "./forms.js";
import { loadDict, t, errorText, formatDate, formatTime, formatMoney, lang, locale, TZ } from "./i18n.js";

const policy = config.policy;
const state = { step: 1, avail: null, slot: null, zone: "any", waitlist: false, change: null };
let root, forms, result;

const today = () => zonedParts(Date.now(), TZ).date;
const errVars = { max: policy.maxPartyOnline, days: policy.bookingWindowDays };

function dayLabel(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

function premiumRule() {
  const p = engine.premiumInfo();
  if (!p.enabled) return "";
  const rule = t(`premium.rule_${p.model}`, { amount: formatMoney(p.amountPerPerson, p.currency) });
  return p.isDemoValue ? `${rule} ${t("premium.demo_value")}` : rule;
}

function go(step) {
  state.step = step;
  result.hidden = true;
  $(".steps", root).hidden = false;
  for (const f of forms) f.hidden = Number(f.dataset.step) !== step;
  for (const li of $$("[data-step-indicator]", root)) {
    const n = Number(li.dataset.stepIndicator);
    if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    li.classList.toggle("is-done", n < step);
  }
  const title = t(["steps.one", "steps.two", "steps.three"][step - 1]);
  $("[data-step-announce]", root).textContent = t("steps.announce", { n: step, title });
  $(`[data-step="${step}"] h2`, root).focus();
}

function busy(form, on) {
  for (const b of form.querySelectorAll("button")) b.disabled = on;
  form.setAttribute("aria-busy", String(on));
}

// ------------------------------------------------------------------ step 1

function initStep1(form) {
  const date = form.elements.date;
  date.min = today();
  date.max = addDays(today(), policy.bookingWindowDays);
  if (!date.value) date.value = addDays(today(), 1);
  form.elements.party.max = policy.maxPartyOnline;
  for (const b of form.querySelectorAll("[data-stepper]")) {
    b.addEventListener("click", () => {
      const input = form.elements.party;
      input.value = Math.min(policy.maxPartyOnline, Math.max(1, (Number(input.value) || 0) + Number(b.dataset.stepper)));
    });
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const party = Number(f.party.value);
    const children = Number(f.children.value || 0);
    const errors = {};
    if (!isValidDate(f.date.value)) errors.date = "invalid_date";
    else if (f.date.value < today()) errors.date = "past_date";
    if (!Number.isInteger(party) || party < 1) errors.party = "invalid_party";
    else if (party > policy.maxPartyOnline) errors.party = "party_too_large";
    if (!Number.isInteger(children) || children < 0 || children >= party) errors.children = "invalid_children";
    if (Object.keys(errors).length) return showErrors(form, errors, errVars);
    clearErrors(form);
    busy(form, true);
    const avail = await engine.getAvailability(f.date.value, party);
    busy(form, false);
    if (!avail.ok) return showErrors(form, { [avail.code === "invalid_date" ? "date" : "party"]: avail.code }, errVars);
    Object.assign(state, { avail, date: f.date.value, party, children, dog: f.dog.checked, glutenFree: f.glutenFree.checked, slot: null, waitlist: false });
    renderStep2();
    go(2);
  });
}

// ------------------------------------------------------------------ step 2

function renderStep2() {
  const form = forms[1];
  const { avail } = state;
  clearErrors(form);
  $("[data-summary-1]", form).textContent = t("reserve.summary_day", { date: dayLabel(state.date), n: state.party });
  const groupNote = $("[data-group-note]", form);
  groupNote.hidden = !avail.requestOnly;
  groupNote.textContent = t("reserve.group_note", { n: policy.groupRequestThreshold });
  $("[data-rain-note]", form).hidden = !avail.rain || avail.rain === "off";

  const grid = $("[data-slots]", form);
  const submit = $("[data-step2-submit]", form);
  if (avail.closed) {
    clear(grid, h("p", {}, errorText(avail.closed, errVars)));
    $("[data-zones]", form).hidden = true;
    $("[data-waitlist-box]", form).hidden = true;
    $("[data-premium-box]", form).hidden = true;
    submit.hidden = true;
    return;
  }
  submit.hidden = false;
  const tiles = avail.slots.map((s) => {
    const full = !s.available && !s.premiumAvailable;
    const input = h("input", { type: "radio", name: "slot", value: s.time, disabled: Boolean(s.reason) });
    input.addEventListener("change", () => selectSlot(s));
    return h("label", { class: `slot-tile${full ? " is-full" : ""}${s.reason ? " is-disabled" : ""}` },
      input, h("strong", {}, s.time), s.reason ? h("small", {}, t("reserve.slot_too_late")) : full ? h("small", {}, t("reserve.slot_full")) : null);
  });
  const anyOpen = avail.slots.some((s) => !s.reason && (s.available || s.premiumAvailable));
  clear(grid, anyOpen ? null : h("p", { class: "span-all" }, t("reserve.no_slots", { n: state.party })), tiles);
  $("[data-zones]", form).hidden = true;
  $("[data-waitlist-box]", form).hidden = true;
  $("[data-premium-box]", form).hidden = true;
}

function selectSlot(s) {
  const form = forms[1];
  state.slot = s.time;
  const full = !s.available && !s.premiumAvailable;
  state.waitlist = full && !state.change;
  $("[data-waitlist-box]", form).hidden = !full;
  const zonesBox = $("[data-zones]", form);
  zonesBox.hidden = full;
  if (full) { $("[data-premium-box]", form).hidden = true; return; }

  const prem = engine.premiumInfo();
  const options = [{ id: "any", ok: s.available }];
  for (const z of config.zones) {
    if (z.id === prem.zone) { if (prem.enabled && !state.change) options.push({ id: z.id, ok: s.premiumAvailable, note: premiumRule() }); continue; }
    options.push({ id: z.id, ok: Boolean(s.zones[z.id]), note: z.weatherDependent ? t("zone.terrace_weather") : null });
  }
  if (!options.find((o) => o.id === state.zone)?.ok) state.zone = options.find((o) => o.ok)?.id || "any";
  clear($("[data-zone-options]", form), options.map((o) => {
    const input = h("input", { type: "radio", name: "zone", value: o.id, disabled: !o.ok, checked: o.id === state.zone });
    input.addEventListener("change", () => { state.zone = o.id; updatePremiumBox(); });
    return h("label", { class: "zone-option" }, input,
      h("span", {}, h("strong", {}, t(`zone.${o.id}`)), o.ok ? (o.note ? h("small", {}, o.note) : null) : h("small", {}, t("zone.unavailable"))));
  }));
  updatePremiumBox();
}

function updatePremiumBox() {
  const box = $("[data-premium-box]", forms[1]);
  const isPremium = state.zone === engine.premiumInfo().zone;
  box.hidden = !isPremium;
  if (isPremium) $("[data-premium-rule]", box).textContent = premiumRule();
}

function initStep2(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.slot) return showErrors(form, { slot: "invalid_slot" });
    clearErrors(form);
    if (state.change) return submitChange(form);
    renderStep3();
    go(3);
  });
}

// ------------------------------------------------------------------ step 3

function renderStep3() {
  const form = forms[2];
  clearErrors(form);
  const zone = state.waitlist ? null : state.zone;
  $("[data-summary-2]", form).textContent = zone && zone !== "any"
    ? t("reserve.summary_zone", { date: dayLabel(state.date), time: state.slot, n: state.party, zone: t(`zone.${zone}`) })
    : t("reserve.summary", { date: dayLabel(state.date), time: state.slot, n: state.party });
  const isPremium = zone === engine.premiumInfo().zone;
  $("[data-premium-accept]", form).hidden = !isPremium;
  const rules = [
    t("rules.window", { days: policy.bookingWindowDays }),
    policy.sameDayCutoff ? t("rules.same_day", { time: policy.sameDayCutoff }) : null,
    t("rules.hold", { minutes: policy.holdMinutes }),
    t("rules.cancel", { hours: policy.freeCancellationHours }),
    config.noShow?.depositAfter ? t("rules.deposit", { n: config.noShow.depositAfter }) : null,
    t("rules.walkins"),
    t("rules.groups", { n: policy.groupRequestThreshold }),
    policy.onePerGuestPerDay ? t("rules.one_per_day") : null,
    t("rules.waitlist", { minutes: config.waitlist.offerMinutes }),
    engine.premiumInfo().enabled ? premiumRule() : null,
    t("rules.privacy", { months: config.retentionMonths }),
  ].filter(Boolean);
  clear($("[data-rules-list]", form), rules.map((r) => h("li", {}, r)));
  $("[data-submit]", form).textContent = state.waitlist ? t("reserve.submit_waitlist") : state.avail.requestOnly ? t("reserve.submit_request") : t("reserve.submit");
}

function initStep3(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const guest = { name: f.name.value, email: f.email.value, phone: f.phone.value };
    const errors = validateGuest(guest);
    if (f.notes.value.length > 500) errors.notes = "notes_too_long";
    if (!f.acceptPolicy.checked) errors.acceptPolicy = "policy_required";
    const premium = !state.waitlist && state.zone === engine.premiumInfo().zone;
    if (premium && !f.acceptPremiumRule.checked) errors.acceptPremiumRule = "premium_rule_required";
    if (Object.keys(errors).length) return showErrors(form, errors, errVars);
    clearErrors(form);

    const input = {
      date: state.date, slot: state.slot, party: state.party, children: state.children, dog: state.dog, glutenFree: state.glutenFree,
      zone: premium || state.zone === "any" || state.waitlist ? null : state.zone, premium, acceptPremiumRule: premium && f.acceptPremiumRule.checked,
      guest, notes: f.notes.value, acceptPolicy: f.acceptPolicy.checked, website: f.website.value, lang,
    };
    busy(form, true);
    const res = state.waitlist ? await engine.joinWaitlist(input) : await engine.createBooking(input);
    busy(form, false);
    if (res.ok) {
      form.reset();
      return state.waitlist ? showWaitlistDone(res) : showBookingDone(res.booking, res);
    }
    if (res.code === "validation") {
      const guestFields = ["name", "email", "phone", "notes", "acceptPolicy", "acceptPremiumRule"];
      const mine = Object.fromEntries(Object.entries(res.errors).filter(([k]) => guestFields.includes(k)));
      if (Object.keys(mine).length) return showErrors(form, mine, errVars);
      return showErrors(form, { _form: `message:${errorText(Object.values(res.errors)[0], errVars)}` });
    }
    if (res.code === "full") {
      state.avail = await engine.getAvailability(state.date, state.party);
      renderStep2();
      go(2);
      return showErrors(forms[1], { _form: `message:${errorText("full")}` });
    }
    showErrors(form, { _form: `message:${errorText(res.code, errVars)}` });
  });
}

// ------------------------------------------------------------------ results and manage views

function showResult(...children) {
  for (const f of forms) f.hidden = true;
  $(".steps", root).hidden = true;
  clear(result, children);
  result.hidden = false;
  result.focus();
}

function bookingDetails(b) {
  const rows = [
    [t("reserve.done_ref"), b.ref],
    [t("reserve.date"), formatDate(b.start)],
    [t("reserve.time_label"), formatTime(b.start)],
    [t("reserve.party"), String(b.party)],
    [t("admin.zone"), t(`zone.${b.zone}`)],
    [t("manage.status"), t(`bstatus.${b.status}`)],
  ];
  return h("dl", {}, rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

function icsButton(b) {
  return h("button", {
    type: "button", class: "btn btn-small btn-ghost",
    onclick: () => download(`rifugio-scotoni-${b.ref}.ics`, toICS({
      uid: `${b.id}@scotoni`, start: b.start, end: b.end, title: t("reserve.ics_title", { n: b.party }),
      description: `${t("reserve.done_ref")}: ${b.ref}`, location: `${hut.name}, ${hut.address.street}, ${hut.address.locality}`, geo: hut.geo,
    }), "text/calendar"),
  }, t("reserve.ics"));
}

function manageLinkBlock(token) {
  const url = `${location.origin}${location.pathname}#manage=${token}`;
  const copy = h("button", { type: "button", class: "btn btn-small btn-ghost" }, t("reserve.copy"));
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); copy.textContent = t("reserve.copied"); } catch { /* user can copy by hand */ }
  });
  return [h("p", {}, t("reserve.manage_link")), h("p", { class: "manage-url" }, url), copy];
}

function whatsappLink(ref) {
  if (!hut.whatsapp) return null;
  return h("a", { class: "btn btn-small btn-ghost", href: `https://wa.me/${hut.whatsapp}?text=${encodeURIComponent(t("reserve.whatsapp_text", { ref }))}`, rel: "noopener", target: "_blank" }, t("reserve.whatsapp"));
}

function newBookingButton() {
  return h("button", { type: "button", class: "btn", onclick: () => { history.replaceState(null, "", location.pathname); state.change = null; go(1); } }, t("reserve.new"));
}

function showBookingDone(b, res = {}) {
  const token = res.token || b.token;
  history.replaceState(null, "", `#manage=${token}`);
  const title = b.status === "requested" ? t("reserve.done_request_title") : t("reserve.done_title");
  showResult(
    h("h2", {}, title),
    h("p", { class: "ref" }, b.ref),
    bookingDetails(b),
    b.status === "pending_payment" ? h("p", { class: "note demo-note" }, t("reserve.payment_pending", { minutes: config.depositHoldMinutes })) : null,
    b.depositReason ? h("p", { class: "note" }, t("reserve.deposit_note", { reason: t(`deposit.${b.depositReason}`) })) : null,
    b.guest?.email ? h("p", {}, t("reserve.done_text", { email: b.guest.email })) : null,
    manageLinkBlock(token),
    h("div", { class: "actions" }, icsButton(b), whatsappLink(b.ref), newBookingButton()),
  );
}

function showWaitlistDone(res) {
  history.replaceState(null, "", `#waitlist=${res.token}`);
  showResult(
    h("h2", {}, t("reserve.done_waitlist_title")),
    h("p", {}, t("waitlist.text", { date: dayLabel(res.entry.date), time: res.entry.slot, n: res.entry.party })),
    h("p", {}, t("reserve.waitlist_position", { n: res.position })),
    h("p", {}, t("reserve.done_text", { email: res.entry.guest.email })),
    h("div", { class: "actions" }, newBookingButton()),
  );
}

async function showManage(token) {
  const res = await engine.getBookingByToken(token);
  if (!res.ok) return showResult(h("h2", {}, t("manage.title")), h("p", {}, t("manage.not_found")), newBookingButton());
  const b = res.booking;
  if (b.status === "offered") return showOffer(token, b);
  const msg = h("p", { role: "status" });
  const actions = h("div", { class: "actions" });
  if (res.canCancel) {
    const cancel = h("button", { type: "button", class: "btn btn-ghost" }, t("manage.cancel"));
    cancel.addEventListener("click", () => {
      clear(actions,
        h("p", {}, t("manage.cancel_confirm")),
        h("button", { type: "button", class: "btn btn-danger", onclick: async () => {
          const r = await engine.cancelBooking(token);
          if (!r.ok) { msg.textContent = errorText(r.code); return; }
          clear(actions, newBookingButton());
          msg.textContent = t("manage.cancelled") + (r.lateCancel ? ` ${t("manage.late_note", { hours: policy.freeCancellationHours })}` : "");
        } }, t("manage.cancel_yes")),
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => showManage(token) }, t("manage.cancel_no")),
      );
      actions.querySelector(".btn-danger").focus();
    });
    actions.append(cancel);
  }
  if (["confirmed", "requested"].includes(b.status)) {
    actions.append(h("button", { type: "button", class: "btn btn-ghost", onclick: () => startChange(token, b) }, t("manage.change")));
    actions.append(icsButton(b));
  }
  showResult(
    h("h2", {}, t("manage.title")),
    bookingDetails(b),
    b.flags?.movedByRain ? h("p", { class: "note" }, t("manage.rain_moved")) : null,
    b.flags?.rainAffected ? h("p", { class: "note demo-note" }, t("manage.rain_affected")) : null,
    msg, actions,
  );
}

function startChange(token, b) {
  state.change = { token, ref: b.ref };
  const f = forms[0].elements;
  f.date.value = b.date;
  f.party.value = b.party;
  f.children.value = b.children || 0;
  go(1);
  showErrors(forms[0], { _form: `message:${t("manage.changing", { ref: b.ref })}` });
}

async function submitChange(form) {
  busy(form, true);
  const res = await engine.changeBooking(state.change.token, {
    date: state.date, slot: state.slot, party: state.party, children: state.children, zone: state.zone === "any" ? null : state.zone,
  });
  busy(form, false);
  if (!res.ok) return showErrors(form, { _form: `message:${errorText(res.code, errVars)}` });
  const token = state.change.token;
  state.change = null;
  showBookingDone(res.booking, { token });
  result.prepend(h("p", { class: "note" }, t("manage.changed")));
}

async function showOffer(token, b) {
  const accept = h("button", { type: "button", class: "btn" }, t("offer.accept"));
  const msg = h("p", { role: "status" });
  accept.addEventListener("click", async () => {
    const r = await engine.acceptOffer(token);
    if (!r.ok) { msg.textContent = errorText(r.code); accept.remove(); return; }
    showBookingDone(r.booking, { token });
    result.prepend(h("p", { class: "note" }, t("offer.accepted")));
  });
  showResult(h("h2", {}, t("offer.title")), bookingDetails(b), h("p", {}, t("offer.text", { time: formatTime(b.expiresAt) })), msg, h("div", { class: "actions" }, accept));
}

async function showWaitlistEntry(token) {
  const res = await engine.getWaitlistEntry(token);
  if (!res.ok) return showResult(h("h2", {}, t("waitlist.title")), h("p", {}, t("manage.not_found")), newBookingButton());
  const e = res.entry;
  const msg = h("p", { role: "status" });
  const leave = h("button", { type: "button", class: "btn btn-ghost" }, t("waitlist.leave"));
  leave.addEventListener("click", async () => {
    const r = await engine.leaveWaitlist(token);
    msg.textContent = r.ok ? t("waitlist.left") : errorText(r.code);
    leave.remove();
  });
  showResult(
    h("h2", {}, t("waitlist.title")),
    h("p", {}, t("waitlist.text", { date: dayLabel(e.date), time: e.slot, n: e.party })),
    msg, h("div", { class: "actions" }, e.status === "waiting" ? leave : null, newBookingButton()),
  );
}

function route() {
  const m = location.hash.match(/^#(manage|offer|waitlist)=([a-f0-9]{16,64})$/);
  if (!m) return go(1);
  if (m[1] === "waitlist") return showWaitlistEntry(m[2]);
  return showManage(m[2]);
}

export async function init([el]) {
  root = el;
  await loadDict();
  forms = $$("form[data-step]", root).sort((a, b) => a.dataset.step - b.dataset.step);
  result = $("[data-result]", root);
  initStep1(forms[0]);
  initStep2(forms[1]);
  initStep3(forms[2]);
  for (const btn of $$("[data-back]", root)) btn.addEventListener("click", () => go(state.step - 1));
  window.addEventListener("hashchange", route);
  route();
}
