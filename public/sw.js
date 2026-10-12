/* CS2 Analyst service worker (S18): offline fallback, static asset cache,
 * Web Push ("analysis ready") and notification clicks.
 * Registered as /sw.js?dev=1 by the dev server, where nothing but the offline
 * page is cached (Turbopack rebuilds assets under the same URLs). */

const VERSION = "v1";
const CACHE = `cs2a-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/pwa/icon-192.png", "/pwa/badge-96.png"];
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheableAsset(url) {
  if (DEV) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/maps/") ||
    url.pathname.startsWith("/weapons/") ||
    url.pathname.startsWith("/pwa/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pages: always the network (they are per user and must never be served
  // stale after sign-out); the offline page only when the network is gone.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Immutable build assets, radar images, icons: cache first.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
        )
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CS2 Analyst", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CS2 Analyst";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/pwa/icon-192.png",
        badge: "/pwa/badge-96.png",
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || "/matches" },
      }),
      // Open tabs refresh their bell right away.
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: "notification" }))),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/matches",
    self.location.origin
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(target.href) : c));
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
