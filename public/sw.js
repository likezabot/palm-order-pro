const CACHE_NAME = "plano-b-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (event) => {
  (event as any).waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("fetch", (event) => {
  (event as any).respondWith(
    caches.match((event as any).request).then((response) => {
      return response || fetch((event as any).request);
    })
  );
});
