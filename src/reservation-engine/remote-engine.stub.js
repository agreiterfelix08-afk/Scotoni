// Browser-side client for a server running the same engine — NOT used by the prototype.
//
// When the backend exists, change ONE line in src/js/engine-setup.js:
//   export const engine = createLocalEngine();
// to
//   export const engine = createRemoteEngine("https://api.example.org/reservations");
//
// The server exposes each engine method as POST /<method> with a JSON array of
// arguments and returns the engine's result object unchanged. The server, not the
// browser, decides `ctx.actor` (from the staff login session) and `ctx.ip`.

const METHODS = [
  "getAvailability", "createBooking", "cancelBooking", "changeBooking", "getBookingByToken",
  "joinWaitlist", "getWaitlistEntry", "leaveWaitlist", "acceptOffer", "promoteWaitlist",
  "setRainMode", "releaseWalkInHold", "addWalkIn", "blockTable", "closeZone", "moveBooking", "setStatus",
  "getDay", "quotaAt", "getAuditLog", "noShowList", "exportCSV", "purgeExpired", "deleteGuestData",
];

export function createRemoteEngine(baseUrl, { fetchImpl = globalThis.fetch } = {}) {
  const call = (method) => async (...args) => {
    // Personal data travels in the POST body only, never in the URL.
    const res = await fetchImpl(`${baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(args.map((a) => (a && a.actor ? { ...a, actor: undefined } : a))),
    });
    if (res.status === 429) return { ok: false, code: "rate_limited" };
    if (!res.ok) return { ok: false, code: "network" };
    return res.json();
  };
  return Object.fromEntries(METHODS.map((m) => [m, call(m)]));
}
