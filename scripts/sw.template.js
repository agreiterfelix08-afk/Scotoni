// Service worker (generated from scripts/sw.template.js by `npm run build`).
// Goal: the site keeps working on a weak or missing mountain connection.
//  - Shared assets of this version are precached at install.
//  - Pages: network first with a short timeout, falling back to the cached copy.
//  - Assets: cache first (they are versioned by the cache name).
const VERSION = "__VERSION__";
const CACHE = `scotoni-${VERSION}`;
const ASSETS = __ASSETS__;
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
