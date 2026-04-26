// Build stamp changes on every deploy to force SW update detection
const BUILD_STAMP = "__BUILD_STAMP__";
const CACHE_NAME = `plano-b-${BUILD_STAMP}`;

const ASSETS = [
  "/",
  "/index.html",
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
      Promise.all(
        names
          // Apaga TUDO que não for o cache estático atual.
          // Isso inclui os caches legados `plano-b-api-*` que faziam
          // stale-while-revalidate em chamadas REST do Supabase e
          // causavam dados desatualizados no PWA instalado.
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Skip non-GET (POST/PUT/etc) entirely — let browser handle.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // NUNCA interceptar chamadas cross-origin.
  // Em particular, NÃO cacheamos mais nada do Supabase (REST/Auth/Realtime/Storage).
  // O React Query persister no IndexedDB cobre o offline parcial.
  if (url.origin !== self.location.origin) return;

  // Navigation: always network-first com fallback para index.html (SPA)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          // Se o servidor deu 404 (comum em refresh de SPA), retorna o index.html do cache
          if (res.status === 404) {
            return caches.match("/index.html").then((cached) => cached || res);
          }
          return res;
        })
        .catch(() => caches.match("/index.html"))
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
