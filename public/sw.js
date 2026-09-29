/**
 * ember service worker.
 *
 * Hand-rolled rather than generated: the caching rules here are specific to a
 * market app, where a stale price is worse than no price but a stale portfolio
 * is better than a blank screen.
 *
 * Bump VERSION to invalidate every cache on the next activation.
 */
const VERSION = "ember-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;
const DATA_CACHE = `${VERSION}-data`;

const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll([OFFLINE_URL, "/icons/icon.svg"]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Serve from cache, and refresh the entry in the background. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Prefer the network; fall back to whatever was last stored. */
async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) {
      const shell = await caches.open(SHELL_CACHE);
      const offline = await shell.match(fallback);
      if (offline) return offline;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build output is content-hashed and immutable — always take the cache.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Market data: try the network every time, because a stale quote presented
  // as current would be actively misleading. The cache exists only so the
  // last-known portfolio stays readable with no connection.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE, OFFLINE_URL));
  }
});

/* ── Notifications ──────────────────────────────────────────────────────────

   `notificationclick` is live. Window alerts are shown through
   `registration.showNotification` (see lib/notifications/permission.ts), which
   is what routes a click back here — so a tap on an alert focuses the tab
   that's already open rather than launching a second copy of the app.

   `push` is live as of phase 26. It was written five phases before anything
   could reach it — deliberately, because the payload shape only wants deciding
   once — and `scripts/send-digests.mjs` now posts exactly this shape through a
   VAPID keypair. The handler did not have to change, which is the argument for
   having written it early.

   Every push ember sends shows a notification, because the subscription is
   created with `userVisibleOnly: true`. That is a promise as well as a Chrome
   requirement: a silent push is a background wake-up, and an app that quietly
   runs code on your device because a server asked it to is not what anyone
   consented to here. */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "ember", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag ?? "ember-window",
      // Replace an earlier alert for the same asset rather than stacking.
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? "/signals" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/signals";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an open tab where possible — a second copy of the app is never
      // what someone wants from a notification.
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          return client.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
