// Staff dashboard. Every action goes through the engine with the logged-in actor;
// the engine decides what needs a reason and writes the audit log.
import { reservations } from "../data/hut.config.js";
import { addDays, parseISO, timeToMinutes, zonedParts } from "../reservation-engine/time.js";
import { engine, store, config } from "./engine-setup.js";
import { loadDemoDay } from "./demo-day.js";
import { h, clear, download, prefs, $, $$ } from "./dom.js";
import { loadDict, t, errorText, formatTime, lang, TZ } from "./i18n.js";

const SESSION_KEY = "scotoni-staff";
let root, ctx, date, day;
const zoneOf = new Map(config.zones.flatMap((z) => z.tables.map((tb) => [tb.id, z])));
const allTables = config.zones.flatMap((z) => z.tables);

const today = () => zonedParts(Date.now(), TZ).date;
const minutes = (iso) => zonedParts(parseISO(iso), TZ).minutesOfDay;
const zoneName = (id) => t(`zone.${id}`);

// ------------------------------------------------------------------ session

function startSession(session) {
  ctx = { actor: { id: session.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "staff", name: session.name, role: session.role } };
  $("[data-login]", root).hidden = true;
  $("[data-dashboard]", root).hidden = false;
  const user = $("[data-admin-user]");
  user.hidden = false;
  $("[data-admin-whoami]").textContent = `${session.name} · ${t(`admin.role_${session.role}`)}`;
  for (const p of $$("[data-owner-panel]", root)) p.hidden = session.role !== "owner";
  date = today();
  $("[data-date]", root).value = date;
  refresh();
}

function initLogin() {
  const form = $("[data-login]", root);
  form.hidden = false;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = form.elements.pin.value;
    const role = pin === reservations.demoPins.owner ? "owner" : pin === reservations.demoPins.staff ? "staff" : null;
    const err = $("#l-pin-err");
    if (!role || !form.elements.name.value.trim()) {
      form.elements.pin.setAttribute("aria-invalid", "true");
      err.textContent = t("admin.login_error");
      form.elements.pin.focus();
      return;
    }
    const session = { name: form.elements.name.value.trim().slice(0, 40), role };
    prefs.set(SESSION_KEY, JSON.stringify(session), "sessionStorage");
    form.reset();
    startSession(session);
  });
  $("[data-logout]").addEventListener("click", () => {
    prefs.set(SESSION_KEY, "", "sessionStorage");
    location.reload();
  });
}

// ------------------------------------------------------------------ helpers

let toastTimer;
function toast(message, isError = false) {
  const el = $("[data-toast]", root);
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function askReason(context) {
  const dialog = $("[data-reason-dialog]", root);
  const form = $("[data-reason-form]", dialog);
  $("[data-reason-context]", dialog).textContent = context || "";
  form.reset();
  dialog.showModal();
  return new Promise((resolve) => {
    const done = (value) => {
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const v = form.elements.reason.value.trim();
      if (v.length < 3) { form.elements.reason.focus(); return; }
      done(v);
    };
    const onCancel = () => done(null);
    const onClose = () => done(null);
    const cancel = $("[data-reason-cancel]", dialog);
    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
  });
}

/** Run an engine action; ask for a reason when the engine requires one (or always, with `force`). */
async function act(run, context, { force = false, success } = {}) {
  let reason = null;
  if (force) {
    reason = await askReason(context);
    if (!reason) return null;
  }
  let res = await run(reason ? { ...ctx, reason } : ctx);
  if (!res.ok && res.code === "reason_required" && !reason) {
    const why = res.violations?.length
      ? t("admin.reason_for_move", { list: res.violations.map((v) => t(`admin.violation.${v}`)).join(", ") })
      : context;
    reason = await askReason(why);
    if (!reason) return null;
    res = await run({ ...ctx, reason });
  }
  if (!res.ok) toast(errorText(res.code), true);
  else toast(success ? success(res) : t("admin.saved"));
  if (res.ok && res.offers?.length) toast(t("admin.offers", { n: res.offers.length }));
  await refresh();
  return res;
}

// ------------------------------------------------------------------ rendering

async function refresh() {
  if (!ctx) return;
  day = await engine.getDay(date, ctx);
  if (!day.ok) return toast(errorText(day.code), true);
  renderStats();
  renderQuick();
  renderTimeline();
  renderWaitlist();
  renderOutbox();
  await renderNoShows();
  if (ctx.actor.role === "owner") await renderAudit();
  const ds = day.dayState;
  const bits = [];
  if (ds.rain !== "off") bits.push(t(ds.rain === "closed" ? "admin.rain_closed" : "admin.rain_reduced"));
  for (const z of ds.closedZones) bits.push(`${zoneName(z)}: ${t("admin.zone_closed")}`);
  $("[data-day-status]", root).textContent = bits.join(" · ");
}

function renderStats() {
  const s = day.stats;
  const tiles = [
    [t("admin.covers"), s.covers], [t("admin.bookings"), s.bookings], [t("admin.walkins"), s.walkIns],
    [t("admin.premium_covers"), s.premiumCovers], [t("admin.noshows_count"), s.noShows], [t("admin.cancelled"), s.cancelled],
    [t("admin.waiting"), s.waitlist],
  ];
  clear($("[data-stats]", root), tiles.map(([k, v]) => h("div", { class: "stat" }, h("dt", {}, k), h("dd", {}, String(v)))));
  clear($("[data-quota]", root), day.quota.map((q) => h("p", { class: "muted" }, t("admin.quota_zone", { zone: zoneName(q.zone), cap: q.onlineCap, seats: q.seats }))));
}

function renderQuick() {
  for (const r of $$('[data-rain] input', root)) r.checked = r.value === day.dayState.rain;
  const held = day.quota.filter((q) => q.seats > q.onlineCap).map((q) => `${zoneName(q.zone)} ${q.seats - q.onlineCap}`);
  $("[data-hold-text]", root).textContent = day.released || !held.length
    ? t("admin.hold_released")
    : t("admin.hold_text", { list: held.join(", "), time: config.walkIn.releaseAt });
  $("[data-release]", root).disabled = day.released;

  const blocked = new Set(day.dayState.blocked.map((b) => b.tableId));
  const sel = $("[data-table-select-block]", root);
  const current = sel.value;
  clear(sel, allTables.map((tb) => h("option", { value: tb.id }, `${tb.id} · ${zoneName(zoneOf.get(tb.id).id)}${blocked.has(tb.id) ? ` (${t("admin.blocked")})` : ""}`)));
  if (current) sel.value = current;
  $("[data-block-toggle]", root).textContent = blocked.has(sel.value) ? t("admin.unblock") : t("admin.block");

  clear($("[data-zone-buttons]", root), config.zones.map((z) => {
    const closed = day.dayState.closedZones.includes(z.id);
    const label = t(closed ? "admin.open_zone_x" : "admin.close_zone_x", { zone: zoneName(z.id) });
    return h("button", {
      type: "button", class: "btn btn-small btn-ghost",
      onclick: () => act((c) => engine.closeZone(date, z.id, !closed, c), t("admin.reason_for_zone", { action: label }), { force: true }),
    }, label);
  }));
}

function timeRange() {
  const starts = config.slots.map(timeToMinutes);
  const maxDwell = Math.max(...config.dwell.map((d) => d.minutes));
  let from = Math.min(...starts) - 30;
  let to = Math.max(...starts) + maxDwell + 30;
  for (const b of day.bookings) { from = Math.min(from, minutes(b.start) - 15); to = Math.max(to, minutes(b.end) + 15); }
  return { from: Math.floor(from / 30) * 30, to: Math.ceil(to / 30) * 30 };
}

const VISIBLE = new Set(["confirmed", "requested", "offered", "pending_payment", "seated", "finished", "no_show"]);

function renderTimeline() {
  const { from, to } = timeRange();
  const span = to - from;
  const pct = (m) => `${((m - from) / span) * 100}%`;
  const ticks = [];
  for (let m = from; m <= to; m += 30) {
    ticks.push(h("span", { class: `tick${m % 60 ? " half" : ""}`, style: `left:${pct(m)}` }, m % 60 ? "" : `${String(m / 60).padStart(2, "0")}:00`));
  }
  const nowParts = zonedParts(Date.now(), TZ);
  const nowLine = date === nowParts.date && nowParts.minutesOfDay >= from && nowParts.minutesOfDay <= to
    ? h("span", { class: "now-line", style: `left:${pct(nowParts.minutesOfDay)}`, "aria-hidden": "true" }) : null;
  const blocked = new Map(day.dayState.blocked.map((b) => [b.tableId, b.reason]));
  const late = new Set(day.late);

  const zones = config.zones.map((z) => {
    const closed = day.dayState.closedZones.includes(z.id);
    const rainOff = z.weatherDependent && day.dayState.rain !== "off";
    const rows = z.tables.map((tb) => {
      const unavailable = closed || blocked.has(tb.id) || (z.weatherDependent && (day.dayState.rain === "closed" || (day.dayState.rain === "reduced" && !tb.covered)));
      const track = h("div", { class: `track${unavailable ? " is-unavailable" : ""}`, dataset: { table: tb.id } }, ticks.map((x) => x.cloneNode(true)), nowLine?.cloneNode(true));
      for (const b of day.bookings.filter((x) => VISIBLE.has(x.status) && x.tableIds.includes(tb.id))) {
        const start = minutes(b.start);
        const end = b.status === "finished" && b.finishedAt ? Math.max(start + 10, minutes(b.finishedAt)) : minutes(b.end);
        const who = b.guest?.name || t("admin.source.walkin");
        const label = `${b.slot} · ${t("admin.party", { n: b.party })} · ${who}`;
        const block = h("button", {
          type: "button",
          class: `booking status-${b.status}${late.has(b.id) ? " is-late" : ""}${b.premium ? " is-premium" : ""}${b.flags?.rainAffected ? " is-rain" : ""}`,
          style: `left:${pct(start)};width:calc(${((end - start) / span) * 100}% - 2px)`,
          draggable: "true",
          dataset: { id: b.id },
          "aria-label": `${label} · ${t(`bstatus.${b.status}`)}${late.has(b.id) ? ` · ${t("admin.late")}` : ""}`,
          title: label,
        }, h("span", { class: "booking-text" }, label), late.has(b.id) ? h("span", { class: "booking-badge" }, t("admin.late")) : null);
        block.addEventListener("click", () => openDrawer(b.id));
        block.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", b.id); e.dataTransfer.effectAllowed = "move"; });
        track.append(block);
      }
      track.addEventListener("dragover", (e) => { e.preventDefault(); track.classList.add("is-drop"); });
      track.addEventListener("dragleave", () => track.classList.remove("is-drop"));
      track.addEventListener("drop", (e) => {
        e.preventDefault();
        track.classList.remove("is-drop");
        const id = e.dataTransfer.getData("text/plain");
        if (id) act((c) => engine.moveBooking(id, [tb.id], c), "");
      });
      return h("div", { class: "tl-row" },
        h("div", { class: "tl-label" }, h("strong", {}, tb.id), h("small", {}, ` ${tb.seats}`), blocked.has(tb.id) ? h("small", { class: "badge" }, t("admin.blocked")) : null),
        track);
    });
    return h("section", { class: `tl-zone${closed ? " is-closed" : ""}` },
      h("h3", {}, zoneName(z.id), closed ? h("span", { class: "badge" }, t("admin.zone_closed")) : null, rainOff ? h("span", { class: "badge badge-rain" }, t(day.dayState.rain === "closed" ? "admin.rain_closed" : "admin.rain_reduced")) : null),
      h("div", { class: "tl-row tl-axis", "aria-hidden": "true" }, h("div", { class: "tl-label" }), h("div", { class: "track axis" }, ticks)),
      rows);
  });
  clear($("[data-timeline]", root), zones);
  clear($("[data-legend]", root), ["confirmed", "requested", "offered", "seated", "finished", "no_show"].map((s) => h("span", { class: `legend-item status-${s}` }, t(`bstatus.${s}`))));
}

function renderWaitlist() {
  const entries = day.waitlist.filter((w) => ["waiting", "offered"].includes(w.status));
  clear($("[data-waitlist]", root), entries.length
    ? h("ol", { class: "plain-list" }, entries.map((w) => h("li", {}, `${w.slot} · ${t("admin.party", { n: w.party })} · ${w.guest?.name ?? ""} · ${w.status === "offered" ? `${t("bstatus.offered")} → ${formatTime(w.offerExpiresAt)}` : t("admin.waiting")}`)))
    : h("p", { class: "muted" }, t("admin.none")));
}

function renderOutbox() {
  const msgs = day.outbox.slice(-30).reverse();
  clear($("[data-outbox]", root), msgs.length
    ? h("ul", { class: "plain-list" }, msgs.map((m) => h("li", {}, h("details", {}, h("summary", {}, `${formatTime(m.at)} · ${m.to} · ${m.subject}`), h("pre", {}, m.text)))))
    : h("p", { class: "muted" }, t("admin.none")));
}

async function renderNoShows() {
  const r = await engine.noShowList(ctx);
  clear($("[data-noshows]", root), r.ok && r.guests.length
    ? h("ul", { class: "plain-list" }, r.guests.map((g) => h("li", {}, `${g.email} · ${t("admin.noshows_count")}: ${g.noShows} · ${t("bstatus.cancelled")}: ${g.lateCancels}${g.depositRequired ? ` · ${t("admin.deposit_required")}` : ""}`)))
    : h("p", { class: "muted" }, t("admin.none")));
}

async function renderAudit() {
  const r = await engine.getAuditLog(ctx);
  if (!r.ok) return;
  const rows = r.entries.slice(0, 200).map((e) => h("tr", { class: e.override ? "is-override" : "" },
    h("td", {}, `${e.at.slice(0, 10)} ${e.at.slice(11, 16)}`),
    h("td", {}, `${e.actor.name} (${e.actor.role})`),
    h("td", {}, `${e.action}${e.ref ? ` ${e.ref}` : ""}${e.detail ? ` – ${e.detail}` : ""}`, e.override ? h("span", { class: "badge" }, t("admin.override")) : null),
    h("td", {}, e.reason || "")));
  clear($("[data-audit]", root), rows.length
    ? h("div", { class: "table-wrap" }, h("table", { class: "audit" }, h("thead", {}, h("tr", {}, [t("admin.when"), t("admin.who"), t("admin.what"), t("admin.why")].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows)))
    : h("p", { class: "muted" }, t("admin.none")));
}

// ------------------------------------------------------------------ drawer

function openDrawer(id) {
  const b = day.bookings.find((x) => x.id === id);
  if (!b) return;
  const drawer = $("[data-drawer]", root);
  const body = $("[data-drawer-body]", drawer);
  const facts = [
    [t("reserve.done_ref"), b.ref],
    [t("reserve.time_label"), `${formatTime(b.start)}–${formatTime(b.end)}`],
    [t("reserve.party"), [t("admin.party", { n: b.party }), b.children ? t("admin.kids", { n: b.children }) : null, b.dog ? t("admin.dog") : null, b.glutenFree ? t("admin.gf") : null].filter(Boolean).join(" · ")],
    [t("admin.zone"), `${zoneName(b.zone)} · ${b.tableIds.join("+")}${b.premium ? ` · ${t("admin.premium")}` : ""}`],
    [t("manage.status"), `${t(`bstatus.${b.status}`)} · ${t(`admin.source.${b.source}`)}`],
    [t("admin.contact"), [b.guest?.name, b.guest?.phone, b.guest?.email].filter(Boolean).join(" · ") || "–"],
    [t("admin.notes"), b.notes || "–"],
  ];
  const actions = [];
  const btn = (label, fn, cls = "btn btn-small") => h("button", { type: "button", class: cls, onclick: async () => { const r = await fn(); if (r?.ok) closeDrawer(); } }, label);
  if (["confirmed", "requested"].includes(b.status)) actions.push(btn(t("admin.seat"), () => act((c) => engine.setStatus(b.id, "seated", c), "")));
  if (b.status === "requested") {
    actions.push(btn(t("admin.confirm"), () => act((c) => engine.setStatus(b.id, "confirmed", c), "")));
    actions.push(btn(t("admin.decline"), () => act((c) => engine.setStatus(b.id, "declined", c), t("admin.reason_for_decline", { ref: b.ref }), { force: true }), "btn btn-small btn-ghost"));
  }
  if (b.status === "seated") actions.push(btn(t("admin.finish"), () => act((c) => engine.setStatus(b.id, "finished", c), "")));
  if (b.status === "confirmed") actions.push(btn(t("admin.noshow"), () => act((c) => engine.setStatus(b.id, "no_show", c), ""), "btn btn-small btn-ghost"));
  if (["confirmed", "requested", "offered", "pending_payment"].includes(b.status)) {
    actions.push(btn(t("admin.cancel"), () => act((c) => engine.cancelBooking(b.id, c), t("admin.reason_for_cancel", { ref: b.ref }), { force: true }), "btn btn-small btn-danger"));
  }

  const moveSelect = h("select", { id: "move-target" }, allTables.map((tb) => h("option", { value: tb.id, selected: b.tableIds.length === 1 && b.tableIds[0] === tb.id }, `${tb.id} (${tb.seats}) · ${zoneName(zoneOf.get(tb.id).id)}`)));
  const moveForm = h("form", { class: "inline-fields move-form" },
    h("label", { for: "move-target" }, t("admin.move")), moveSelect,
    h("button", { type: "submit", class: "btn btn-small btn-ghost" }, t("admin.move_submit")));
  moveForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await act((c) => engine.moveBooking(b.id, [moveSelect.value], c), "");
    if (r?.ok) closeDrawer();
  });

  clear(body,
    h("dl", { class: "facts-list" }, facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
    b.flags?.movedByRain ? h("p", { class: "note" }, t("admin.rain_moved")) : null,
    b.flags?.rainAffected ? h("p", { class: "note demo-note" }, t("admin.rain_affected")) : null,
    h("div", { class: "drawer-actions" }, actions),
    ["confirmed", "requested", "seated"].includes(b.status) ? moveForm : null);
  drawer.hidden = false;
  drawer.focus();
}

function closeDrawer() {
  $("[data-drawer]", root).hidden = true;
}

// ------------------------------------------------------------------ quick actions

function initQuickActions() {
  for (const b of $$("[data-day]", root)) b.addEventListener("click", () => { date = addDays(date, Number(b.dataset.day)); $("[data-date]", root).value = date; refresh(); });
  $("[data-today]", root).addEventListener("click", () => { date = today(); $("[data-date]", root).value = date; refresh(); });
  $("[data-date]", root).addEventListener("change", (e) => { if (e.target.value) { date = e.target.value; refresh(); } });
  $("[data-drawer-close]", root).addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("[data-drawer]", root).hidden) closeDrawer(); });

  const tableSel = $("[data-table-select]", root);
  tableSel.append(...allTables.map((tb) => h("option", { value: tb.id }, `${tb.id} (${tb.seats}) · ${zoneName(zoneOf.get(tb.id).id)}`)));
  const walkin = $("[data-walkin]", root);
  walkin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = walkin.elements;
    const r = await act((c) => engine.addWalkIn({ date, party: Number(f.party.value), time: f.time.value || undefined, tableIds: f.table.value ? [f.table.value] : undefined, name: f.name.value }, c), "");
    if (r?.ok) walkin.reset();
  });

  for (const radio of $$("[data-rain] input", root)) {
    radio.addEventListener("change", async () => {
      const r = await act((c) => engine.setRainMode(date, radio.value, c), "", { success: (res) => t("admin.rain_result", { moved: res.moved.length, affected: res.affected.length }) });
      const out = $("[data-rain-result]", root);
      if (!r?.ok) return;
      const list = (title, items) => items.length ? [h("h4", {}, title), h("ul", { class: "plain-list" }, items.map((x) => h("li", {}, `${x.slot} · ${t("admin.party", { n: x.party })} · ${x.name || x.ref}${x.to ? ` → ${x.to.join("+")}` : ""}`)))] : [];
      clear(out, h("p", {}, t("admin.rain_result", { moved: r.moved.length, affected: r.affected.length })), list(t("admin.rain_moved"), r.moved), list(t("admin.rain_affected"), r.affected));
    });
  }

  $("[data-release]", root).addEventListener("click", () => act((c) => engine.releaseWalkInHold(date, c), "", { success: () => t("admin.released") }));

  const blockForm = $("[data-block-form]", root);
  blockForm.elements.table.addEventListener("change", () => renderQuick());
  blockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const tableId = blockForm.elements.table.value;
    const isBlocked = day.dayState.blocked.some((b) => b.tableId === tableId);
    if (isBlocked) act((c) => engine.blockTable(date, tableId, c, { unblock: true }), "");
    else act((c) => engine.blockTable(date, tableId, c), t("admin.reason_for_block", { table: tableId }), { force: true });
  });

  const phone = $("[data-phone-booking]", root);
  phone.elements.slot.append(...config.slots.map((s) => h("option", { value: s }, s)));
  phone.elements.zone.append(h("option", { value: "" }, t("zone.any")), ...config.zones.map((z) => h("option", { value: z.id }, zoneName(z.id))));
  phone.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = phone.elements;
    const premium = f.zone.value === engine.premiumInfo().zone;
    const input = {
      date, slot: f.slot.value, party: Number(f.party.value), zone: premium ? (f.override.checked ? f.zone.value : null) : f.zone.value || null,
      premium, acceptPremiumRule: premium, guest: { name: f.name.value, email: f.email.value, phone: f.phone.value }, lang,
    };
    const r = await act((c) => engine.createBooking(input, f.override.checked ? { ...c, override: true } : c), t("admin.reason_for_override"), { force: f.override.checked });
    if (r?.ok) phone.reset();
    if (r && !r.ok && r.errors) toast(Object.values(r.errors).map((code) => errorText(code)).join(" "), true);
  });

  $("[data-load-demo]", root).addEventListener("click", async () => {
    if (!confirm(t("admin.reset_confirm"))) return;
    await loadDemoDay(date, { lang, name: (n) => t("admin.demo_name", { n }) });
    toast(t("admin.demo_loaded", { date }));
    refresh();
  });
  $("[data-reset-demo]", root).addEventListener("click", async () => {
    if (!confirm(t("admin.reset_confirm"))) return;
    await store.reset();
    refresh();
  });

  $("[data-export]", root).addEventListener("click", async () => {
    const r = await engine.exportCSV(date, ctx);
    if (r.ok) download(`scotoni-${date}.csv`, r.csv, "text/csv;charset=utf-8");
    else toast(errorText(r.code), true);
    refresh();
  });
  $("[data-purge]", root).addEventListener("click", () => {
    if (!confirm(t("admin.purge_confirm"))) return;
    act((c) => engine.purgeExpired(c), "", { success: (r) => t("admin.purge_done", { bookings: r.bookings }) });
  });
  const del = $("[data-delete-guest]", root);
  del.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = del.elements.email.value;
    if (!confirm(t("admin.delete_confirm", { email }))) return;
    act((c) => engine.deleteGuestData(email, c), "", { success: (r) => t("admin.delete_done", { count: r.count }) }).then((r) => { if (r?.ok) del.reset(); });
  });
}

export async function init([el]) {
  root = el;
  await loadDict();
  initLogin();
  initQuickActions();
  store.subscribe(() => refresh());
  setInterval(() => refresh(), 60000);
  try {
    const saved = JSON.parse(prefs.get(SESSION_KEY, "sessionStorage") || "null");
    if (saved?.name && ["staff", "owner"].includes(saved.role)) startSession(saved);
  } catch { /* stay on login */ }
}
