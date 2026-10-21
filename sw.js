// Service worker (generated from scripts/sw.template.js by `npm run build`).
// Goal: the site keeps working on a weak or missing mountain connection.
//  - Shared assets of this version are precached at install.
//  - Pages: network first with a short timeout, falling back to the cached copy.
//  - Assets: cache first (they are versioned by the cache name).
const VERSION = "05cab9eec6d5";
const CACHE = `scotoni-${VERSION}`;
const ASSETS = [
  "assets/icon.svg",
  "src/data/gallery.js",
  "src/data/hut.config.js",
  "src/data/menu.js",
  "src/data/trail.js",
  "src/data/wines.js",
  "src/features/ega-scotoni/data.js",
  "src/features/ega-scotoni/ega-scotoni.css",
  "src/features/ega-scotoni/ega-scotoni.js",
  "src/i18n/de.js",
  "src/i18n/en.js",
  "src/i18n/it.js",
  "src/js/admin.js",
  "src/js/art.js",
  "src/js/demo-day.js",
  "src/js/dom.js",
  "src/js/engine-setup.js",
  "src/js/family.js",
  "src/js/forms.js",
  "src/js/gallery.js",
  "src/js/i18n.js",
  "src/js/menu.js",
  "src/js/reserve.js",
  "src/js/rooms.js",
  "src/js/site.js",
  "src/js/status.js",
  "src/js/trail.js",
  "src/js/wine.js",
  "src/reservation-engine/allocator.js",
  "src/reservation-engine/engine.js",
  "src/reservation-engine/ics.js",
  "src/reservation-engine/index.js",
  "src/reservation-engine/providers.js",
  "src/reservation-engine/stores/local-storage-store.js",
  "src/reservation-engine/stores/memory-store.js",
  "src/reservation-engine/templates.js",
  "src/reservation-engine/time.js",
  "src/reservation-engine/validation.js",
  "src/styles/admin.css",
  "src/styles/main.css"
];
const PAGE_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((p) => new URL(p, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("scotoni-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function pageResponse(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(PAGE_TIMEOUT_MS)]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || new Response("<h1>Offline</h1><p>Rifugio Scotoni: this page is not saved on your device yet.</p>", { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 });
  }
}

async function assetResponse(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate" || request.destination === "document") event.respondWith(pageResponse(request));
  else event.respondWith(assetResponse(request));
});
