/* Generated with the production build's complete set of immutable assets. */
const CACHE_NAME = "fonsat-shell-__BUILD_ID__";
const ASSETS = __PRECACHE_ASSETS__;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(
        ASSETS.map((url) => new Request(url, { cache: "reload" })),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("fonsat-shell-") && key !== CACHE_NAME)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.open(CACHE_NAME))
            .match("/")
            .then((response) => response ?? Response.error());
        }
      })(),
    );
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () =>
        (await (await caches.open(CACHE_NAME)).match(url.pathname)) ??
        fetch(request))(),
    );
  }
});
