/**
 * Retired service worker (2026-11-12). Its only job is to remove the one before it.
 *
 * Connect registered a service worker from April to June 2026 and has registered none since.
 * A phone that picked it up then still runs that copy, which answers image and font requests
 * from its own store and can go on showing old files. Deleting this file would not reach such
 * a phone: a browser keeps the worker it has when the script goes missing.
 *
 * So this file takes its place. When such a phone next opens Connect, the browser fetches
 * /sw.js, sees that it changed and installs this one, which empties the old store and
 * unregisters itself. It has no fetch handler, so it never answers a request.
 *
 * Nothing registers this file, so a phone that never had the old worker never gets it.
 * Delete this file once the old copies have had time to clear (after 2027-02-12).
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("citizens-")).map((key) => caches.delete(key)));
      await self.registration.unregister();
    })(),
  );
});
