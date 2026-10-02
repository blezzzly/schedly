/* Schedly service worker — app-shell + runtime caching for offline support.
 *
 * Strategy:
 *  - Navigation (HTML shell): network-first, falls back to the last good
 *    cached page, then to /offline.html when completely offline.
 *  - RSC payloads (client-side tab switching): stale-while-revalidate — the
 *    page the user already visited renders instantly offline.
 *  - Static build assets (_next/static, icons, images): cache-first. Hashed
 *    filenames are immutable, so cached copies never go stale.
 *  - Schedule images (DB-backed /api/upload ID file endpoint): network-first with
 *    cache fallback so previously loaded schedule photos still render offline.
 *  - Everything else (API, non-GET): network only — we never cache user data
 *    or server responses unless the page itself is cached as HTML.
 */

// --- Push notifications ----------------------------------------------------
// The server sends data-only pushes (FCM and legacy web-push alike), so ALL
// of them arrive here as a plain `push` event — foreground messages go to the
// page's onMessage handler, background/closed-app messages land here. We
// render the notification ourselves so display never depends on browser
// auto-handling of a `notification` field.
const CACHE_NAME = "schedly-cache-v4";
const RSC_CACHE = `${CACHE_NAME}-rsc`;

// Dev mode. The app registers this worker on localhost too — otherwise push
// could only ever be tested against a production deploy — and the `?dev=1`
// query is how we tell the two apart.
//
// With dev on this worker does NO caching at all: no precache, no fetch
// handling, no navigation fallbacks. Every request goes straight to the
// network. That matters because dev chunk URLs are rebuilt on each server
// restart, so a cache-first worker would hand back stale module factories and
// break HMR. Push and notification events are unaffected — the browser
// dispatches those directly, they don't go through the fetch handler.
const IS_DEV = new URL(self.location.href).searchParams.has("dev");

// External images (avatars, weather icons) are fetched with no-cors so they
// CAN be cached — otherwise the browser blocks them and offline avatars fail.
function isExternalImage(url) {
  return (
    url.hostname === "lh3.googleusercontent.com" ||
    url.hostname.endsWith(".googleusercontent.com") ||
    url.hostname === "avatars.githubusercontent.com" ||
    url.hostname.endsWith(".githubusercontent.com") ||
    url.hostname === "openweathermap.org" ||
    url.hostname.endsWith(".openweathermap.org") ||
    url.hostname === "blob.vercel-storage.com" ||
    url.hostname.endsWith(".blob.vercel-storage.com")
  );
}

// When offline, navigation can still land on a URL that was never cached
// (e.g. "/" redirects for signed-in users). Fall back to the main app pages
// in a sensible order instead of giving up with the offline screen.
const NAV_FALLBACKS = [
  "/dashboard",
  "/schedule",
  "/notes",
  "/notifications",
  "/pomodoro",
  "/gpa",
  "/login",
  "/",
];

const PRECACHE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/logo.jpg",
  "/offline.html",
  "/notif-icon.svg",
];

self.addEventListener("install", (event) => {
  // Dev: activate immediately with an empty cache — nothing to precache, and
  // precaching is exactly what would serve stale dev chunks.
  if (IS_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_ASSETS);
      self.skipWaiting();
    })().catch(() => {
      // Precaching is best-effort — a failed asset must not block activation.
      self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (!IS_DEV) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_NAME) && k !== ALARMS_CACHE)
            .map((k) => caches.delete(k))
        );
      }
      await self.clients.claim();
      // Re-arm persisted reminder alarms (SW restarts, cache updates, etc.).
      await armAlarms();
    })()
  );
});

// Auto-download while online: after login the app tells us which pages the
// user will likely open, and we warm the cache for them in the background.
// Also receives programmed class-reminder alarms for local notification
// triggers (fires on time even when Schedly isn't open, no server needed).
const ALARMS_CACHE = "schedly-alarms";

async function readAlarms() {
  try {
    const cache = await caches.open(ALARMS_CACHE);
    const res = await cache.match("/alarms.json");
    if (!res) return [];
    const data = await res.json();
    // Drop legacy "upcoming" (-X min) alarms: they now arrive as server
    // pushes, so this alarm only fires the "class now" notification.
    return Array.isArray(data) ? data.filter((a) => !String(a && a.id).endsWith(":upcoming")) : [];
  } catch {
    return [];
  }
}

async function writeAlarms(alarms) {
  const cache = await caches.open(ALARMS_CACHE);
  await cache.put("/alarms.json", new Response(JSON.stringify(alarms), { headers: { "Content-Type": "application/json" } }));
}

/** Show a notification immediately (used by the ticker fallback). */
async function fireAlarmNow(alarm) {
  const tag = `rem-${alarm.id}-${alarm.fireAt}`;
  await self.registration.showNotification(alarm.title || "Schedly", {
    body: alarm.body || "",
    icon: "/icons/icon-192.png",
    badge: "/notif-icon.svg",
    data: { url: alarm.url || "/" },
    tag,
  });
}

/** While the service worker is alive, fire any alarm that came due. This
 *  covers browsers/installs where Notification Triggers aren't available
 *  (e.g. the site isn't installed as an app) — alarms fire within ~20s of
 *  their time as long as the browser tab is open. */
let alarmTicker = null;
function startAlarmTicker() {
  if (alarmTicker) return;
  alarmTicker = setInterval(async () => {
    const alarms = await readAlarms();
    if (alarms.length === 0) return;
    const now = Date.now();
    const remaining = [];
    let changed = false;
    for (const alarm of alarms) {
      if (alarm.fireAt > now) {
        remaining.push(alarm);
        continue;
      }
      // Due. Fire it — the tag is shared with the real trigger, so if the
      // browser already showed the trigger notification this just replaces it
      // (never duplicates). This also covers the case where a trigger was
      // "armed" but never actually fired (e.g. the site isn't installed).
      try {
        await fireAlarmNow(alarm);
      } catch {
        // Permission revoked or similar — skip.
      }
      changed = true;
    }
    if (changed) await writeAlarms(remaining);
  }, 10000);
}

/** Re-arm programmed alarms. With Notification Triggers they fire exactly on
 *  time even when the SW later sleeps; storage survives so we re-arm after
 *  every activation. Without triggers, the ticker handles due alarms. */
async function armAlarms() {
  startAlarmTicker();
  const alarms = await readAlarms();
  const now = Date.now();
  const remaining = [];
  for (const alarm of alarms) {
    if (alarm.fireAt <= now) continue;
    remaining.push(alarm);
    // Unique tag per (id, fireAt): the "upcoming" and "starting now" alarms
    // for the same class must not replace each other in the notification bar.
    const tag = `rem-${alarm.id}-${alarm.fireAt}`;
    let armed = false;
    try {
      if (typeof TimestampTrigger !== "undefined") {
        await self.registration.showNotification(alarm.title || "Schedly", {
          body: alarm.body || "",
          icon: "/icons/icon-192.png",
          badge: "/notif-icon.svg",
          data: { url: alarm.url || "/" },
          tag,
          showTrigger: new TimestampTrigger(alarm.fireAt),
        });
        armed = true;
      }
    } catch {
      // Trigger unsupported (not installed as an app): the ticker will fire
      // this alarm while the SW is alive.
    }
    remaining[remaining.length - 1] = { ...alarm, armed: alarm.armed || armed };
  }
  await writeAlarms(remaining);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "PRECACHE") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const rscCache = await caches.open(RSC_CACHE);
        for (const url of data.urls || []) {
          try {
            // External images (avatars) need no-cors so they can be cached;
            // otherwise the browser blocks the request and offline fails.
            const u = new URL(url, self.location.origin);
            const res = await fetch(url, isExternalImage(u) ? { mode: "no-cors" } : {});
            if (res.ok || res.type === "opaque") {
              cache.put(url, res.clone());
              // Warm the JS/CSS chunks referenced by the page so it actually
              // renders offline — the HTML shell alone is not enough.
              if (res.type !== "opaque") {
                const html = await res.clone().text();
                const refs = html.match(/\/_next\/static\/[^"']+/g) || [];
                for (const ref of [...new Set(refs)]) {
                  try {
                    const asset = await fetch(ref);
                    if (asset.ok) cache.put(ref, asset.clone());
                  } catch {
                    // Best-effort.
                  }
                }
              }
            }
          } catch {
            // Best-effort; skip pages that fail.
          }
          try {
            // Warm the RSC payload too, keyed by plain path, so the page
            // still navigates client-side when offline.
            const rsc = await fetch(url, { headers: { RSC: "1" } });
            if (rsc.ok) rscCache.put(new URL(url, self.location.origin).pathname, rsc.clone());
          } catch {
            // Best-effort.
          }
        }
      })()
    );
  } else if (data.type === "PROGRAM_ALARMS") {
    event.waitUntil(
      (async () => {
        const now = Date.now();
        const alarms = Array.isArray(data.alarms)
          ? data.alarms.filter((a) => a && typeof a.fireAt === "number" && a.fireAt > now)
          : [];
        await writeAlarms(alarms);
        await armAlarms();
      })()
    );
  } else if (data.type === "REARM_ALARMS") {
    event.waitUntil(armAlarms());
  }
});

self.addEventListener("fetch", (event) => {
  // Dev: stay out of the way entirely so nothing is ever served from a cache.
  if (IS_DEV) return;
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  const isSameOrigin = url.origin === self.location.origin;

  // --- Navigation: network-first, offline fallback -------------------------
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          // The requested URL may not be cached directly (e.g. "/" was a
          // redirect while signed in) — serve the best known app page so the
          // user lands on Schedly, not on the offline card.
          for (const route of NAV_FALLBACKS) {
            const fallback = await cache.match(route);
            if (fallback) return fallback;
          }
          return (await cache.match("/offline.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // --- RSC payloads (soft navigation): stale-while-revalidate --------------
  // Next.js fetches these when switching tabs client-side. Caching them lets
  // previously visited tabs load instantly and work offline.
  const isRsc = request.headers.get("RSC") === "1" || url.searchParams.has("__rsc");
  if (isSameOrigin && isRsc) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RSC_CACHE);
        const pathKey = url.origin + url.pathname;
        const cached =
          (await cache.match(request)) || (await cache.match(pathKey));
        const fetched = fetch(request).then((res) => {
          if (res.ok) {
            cache.put(request, res.clone());
            cache.put(pathKey, res.clone());
          }
          return res;
        });
        if (cached) {
          // Background refresh keeps it fresh without waiting on the network.
          fetched.catch(() => {});
          return cached;
        }
        return fetched;
      })()
    );
    return;
  }

  // --- Static assets: cache-first ------------------------------------------
  if (
    isSameOrigin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname === "/notif-icon.svg")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
          // Revalidate in the background so the next visit is fresh.
          fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
            })
            .catch(() => {});
          return cached;
        }
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })()
    );
    return;
  }

  // --- Web app manifest: cache-first ---------------------------------------
  if (isSameOrigin && url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })()
    );
    return;
  }

  // --- Schedule images (DB-backed): network-first, cache fallback ----------
  if (isSameOrigin && url.pathname.startsWith("/api/upload/") && url.pathname.endsWith("/file")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          return (await cache.match(request)) || Response.error();
        }
      })()
    );
    return;
  }

  // --- Blob-storage images (legacy): network-first, cache fallback ---------
  // --- Avatars & weather icons (external images): network-first, cache
  // fallback so the user's photo and the weather card still render when
  // offline. Google/GitHub avatar URLs and OpenWeatherMap icons are safe to
  // cache — they're public, and revalidate in the background when online.
  if (isExternalImage(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          // Match the original request mode — images load as no-cors and the
          // opaque response can still be put() into the cache.
          const res = await fetch(request);
          cache.put(request, res.clone()).catch(() => {});
          return res;
        } catch {
          return (await cache.match(request)) || Response.error();
        }
      })()
    );
    return;
  }

  // --- Everything else: network only ---------------------------------------
});

// --- Push notifications ----------------------------------------------------
// The server sends data-only pushes (FCM and legacy web-push alike), so ALL
// of them arrive here as a plain `push` event — foreground messages go to the
// page's onMessage handler, background/closed-app messages land here. We
// render the notification ourselves so display never depends on browser
// auto-handling of a `notification` field.
//
// Payload shapes handled:
//  - FCM data-only: { data: { title, body, url, tag }, from, messageId, ... }
//  - Legacy web-push: { title, body, url } (flat)
//  - Legacy FCM: { notification: { title, body }, data: { title, body, url } }
self.addEventListener("push", (event) => {
  let payload = { title: "Schedly", body: "", url: "/" };
  try {
    const parsed = event.data ? JSON.parse(event.data.text()) : {};
    if (parsed && typeof parsed === "object") {
      if (parsed.notification && typeof parsed.notification === "object") {
        Object.assign(payload, parsed.notification);
      }
      if (parsed.data && typeof parsed.data === "object") {
        Object.assign(payload, parsed.data);
      } else if (!parsed.notification) {
        Object.assign(payload, parsed);
      }
    }
  } catch {
    // Fall back to defaults if the payload isn't valid JSON.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Schedly", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/notif-icon.svg",
      data: { url: payload.url || "/" },
      tag: payload.tag || `schedly-${Date.now()}`,
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});