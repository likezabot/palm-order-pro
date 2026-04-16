const CACHE_NAME = "plano-b-v3";

// Only cache static assets, NOT the HTML shell
const ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  // Delete ALL old caches
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim()) // Take control of all tabs immediately
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Navigation requests (HTML pages): ALWAYS go to network
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // For cached static assets: cache-first
  if (ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(event.request).then((r) => r || fetch(event.request))
    );
    return;
  }

  // Everything else (JS bundles, CSS, API calls): network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
