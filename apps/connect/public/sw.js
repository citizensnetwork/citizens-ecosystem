/**
 * Citizens Connect — minimal PWA shell service worker.
 *
 * Strategy:
 *  - Pre-cache the app shell (manifest + icons) on install so the
 *    app can open offline to a branded loading state.
 *  - Network-first for HTML navigations — always try fresh content,
 *    fall back to cached shell only when offline.
 *  - Cache-first for same-origin static assets (icons, fonts).
 *  - Never intercept Supabase, MapTiler, analytics or POSTs —
 *    those must go straight to the network every time.
 */

const SHELL_CACHE = "citizens-shell-v1";
const SHELL_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // Don't let a single missing icon block SW install for everyone
      // — cache what we can, ignore what we can't.
      await Promise.allSettled(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => {})),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("citizens-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* best-effort */
        }
      }
      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Never cache non-GET or cross-origin — Supabase auth cookies and
  // API responses must always go to the network.
  if (req.method !== "GET") return;
  if (!isSameOrigin(req)) return;

  const url = new URL(req.url);

  // Skip Next.js build artifacts, API routes, and the SW itself.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/sw.js"
  ) {
    return;
  }

  // Network-first for true navigations only — don't intercept
  // programmatic fetches that happen to include `text/html` in Accept.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Prefer navigation preload where available.
          if (event.preloadResponse) {
            const preload = await event.preloadResponse;
            if (preload) return preload;
          }
          return await fetch(req);
        } catch {
          return new Response(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Offline</title></head><body style=\"font-family:system-ui;padding:2rem;text-align:center\"><h1>You're offline</h1><p>Reconnect to load Citizens Connect.</p></body></html>",
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          );
        }
      })(),
    );
    return;
  }

  // Cache-first for a narrow allow-list of static assets. Everything
  // else falls through to the browser's HTTP cache — we don't want
  // to silently pin arbitrary same-origin GETs (e.g. robots.txt,
  // future static routes) into persistent cache.
  const isCacheableAsset =
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);
  if (!isCacheableAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return cached ?? Response.error();
      }
    })(),
  );
});
