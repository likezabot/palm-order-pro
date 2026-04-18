// Build stamp changes on every deploy to force SW update detection
const BUILD_STAMP = "__BUILD_STAMP__";
const CACHE_NAME = `plano-b-${BUILD_STAMP}`;

const ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Skip non-GET (POST/PUT/etc) entirely — let browser handle.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin requests (Supabase, CDNs, etc.) — never intercept.
  if (url.origin !== self.location.origin) return;

  // Navigation: always network-first com no-store para nunca servir HTML cacheado
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets: cache-first
  if (ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(req).then((r) => r || fetch(req))
    );
    return;
  }

  // Same-origin everything else: network-first
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
