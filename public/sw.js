/*
 * Temple service worker.
 * - Caches the app shell (pages and static assets) so the app opens offline.
 * - Never caches /api responses: personal data stays in the app's own store and the server.
 * Push notification handlers are added in milestone M2.
 */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(request) {
  return caches.open(STATIC_CACHE).then((cache) =>
    cache.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }),
    ),
  );
}

function networkFirstPage(request) {
  return caches.open(PAGE_CACHE).then((cache) => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000, null));
    const network = fetch(request)
      .then((res) => {
        if (res.ok && !res.redirected && res.type === "basic") cache.put(request, res.clone());
        return res;
      })
      .catch(() => null);
    return Promise.race([network, timeout]).then(
      (res) => res || cache.match(request).then((hit) => hit || cache.match("/")).then((hit) => hit || network),
    );
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});
