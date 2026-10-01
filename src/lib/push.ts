"use client";

/* Native Web Push (VAPID) client helpers. The browser subscribes via
 * pushManager.subscribe() with Schedly's VAPID public key (served by
 * /api/push/vapid-key), then registers the resulting subscription with
 * POST /api/notifications/subscribe. All sending happens server-side. */

export type PushResult =
  | { ok: true }
  | { ok: false; code: PushErrorCode; reason: string };

export type PushErrorCode =
  | "PUSH_NOT_SUPPORTED"
  | "NOTIFICATION_PERMISSION_DENIED"
  | "SERVICE_WORKER_NOT_READY"
  | "SUBSCRIPTION_FAILED"
  | "INVALID_SUBSCRIPTION"
  | "UNAUTHORIZED"
  | "PUSH_SEND_FAILED"
  | "NETWORK_ERROR";

export type PushPermission = "default" | "granted" | "denied";

export type PushState =
  | { kind: "unsupported"; reasons: string[] }
  | { kind: "default"; permission: PushPermission }
  | { kind: "denied"; permission: "denied" }
  | { kind: "granted"; subscribed: boolean };

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

export function pushUnsupportedReasons(): string[] {
  const reasons: string[] = [];
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    reasons.push("This browser has no Service Worker support");
  }
  if (!("Notification" in window)) {
    reasons.push("The Notification API isn't available (common in Android app WebViews)");
  }
  if (!("PushManager" in window)) {
    reasons.push("Push messages aren't supported in this browser");
  }
  return reasons;
}

/** Installed iOS/iPadOS PWA vs a plain Safari tab — push needs the former. */
export function isIosPwa(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return ios && standalone;
}

let vapidKeyPromise: Promise<string | null> | null = null;

/** Fetch Schedly's VAPID public key from the server (never baked into the
 *  client bundle). Cached across enable attempts on one page load. */
export function fetchVapidPublicKey(): Promise<string | null> {
  if (!vapidKeyPromise) {
    vapidKeyPromise = fetch("/api/push/vapid-key")
      .then((res) => (res.ok ? (res.json() as Promise<{ publicKey: string }>).then((d) => d.publicKey ?? null) : null))
      .catch(() => null);
  }
  return vapidKeyPromise;
}

/** Base64URL (web-push applicationServerKey) → Uint8Array. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function base64UrlOf(bytes: ArrayBuffer | ArrayBufferView | null | undefined): string | null {
  if (bytes == null) return null;
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Ensure the Schedly service worker is registered and ready to accept a
 *  push subscription. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    // Dev registers the worker too, but with a `?dev=1` query. The worker sees
    // that flag and skips ALL caching, so push can be exercised on localhost
    // while dev chunk URLs still resolve from the network — a cache-first
    // worker would serve stale module factories after every server restart.
    // Production registers the same worker without the query and caches
    // normally.
    const swUrl = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";

    // A no-op when the worker already exists, but it still re-checks for
    // post-deploy updates in the background — without forcing an immediate
    // worker replacement that would abort an in-flight subscribe().
    const reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: "none" });

    // Wait until an active worker is actually ready before returning. Creating
    // a push subscription while the worker is still installing or being
    // replaced makes Chrome abort subscribe() with an AbortError, so we never
    // hand back a half-initialised registration.
    if (!reg.active) {
      await navigator.serviceWorker.ready.catch(() => {});
    }
    return reg.active ? reg : null;
  } catch {
    return null;
  }
}

/** Read the device's push state without prompting for permission. */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return { kind: "unsupported", reasons: pushUnsupportedReasons() };
  const permission = Notification.permission;
  if (permission === "denied") return { kind: "denied", permission };
  try {
    const reg = await ensureServiceWorker();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return { kind: "granted", subscribed: Boolean(sub) };
  } catch {
    return { kind: "default", permission };
  }
}

function detectPlatform(): { userAgent: string; device: string; platform: string } {
  const ua = navigator.userAgent;
  let device = "unknown";
  if (/iPad/.test(ua)) device = "iPad";
  else if (/iPhone/.test(ua)) device = "iPhone";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Mac/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua)) device = "Windows";
  else if (/Linux/.test(ua)) device = "Linux";
  const pwa = Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
  return {
    userAgent: ua,
    device,
    platform: pwa ? `${device} (PWA)` : device,
  };
}

/** Serialise subscribe attempts so two components (e.g. onboarding and the
 *  notifications page) can never fire pushManager.subscribe() at the same time
 *  — concurrent subscribe calls abort each other with an AbortError. */
let enablePushInFlight: Promise<PushResult> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** pushManager.subscribe() aborts with an AbortError when the service worker
 *  is mid-update or the browser's push service is briefly unreachable — both
 *  transient. Retry a couple of times before giving up. */
async function subscribeWithRetry(
  reg: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (err) {
      lastError = err;
      if ((err as { name?: string })?.name !== "AbortError") throw err;
      if (attempt < 3) await delay(750 * attempt);
    }
  }
  throw lastError;
}

/** Subscribe this device via the native push service and register it with
 *  Schedly. Stale subscriptions from the old FCM era are dropped first so
 *  pushManager always carries a subscription bound to the current VAPID key. */
export async function enablePush(): Promise<PushResult> {
  if (enablePushInFlight) return enablePushInFlight;
  enablePushInFlight = (async () => {
    try {
      if (!isPushSupported()) {
        return { ok: false, code: "PUSH_NOT_SUPPORTED", reason: pushUnsupportedReasons().join(" · ") };
      }
      if (Notification.permission === "denied") {
        return {
          ok: false,
          code: "NOTIFICATION_PERMISSION_DENIED",
          reason: isIosPwa()
            ? "Notifications are blocked. Enable them in iOS Settings → Schedly → Notifications."
            : "Notifications are blocked. Enable them in your browser or device settings, then try again.",
        };
      }
      if (Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          return {
            ok: false,
            code: "NOTIFICATION_PERMISSION_DENIED",
            reason: "Notification permission wasn't granted.",
          };
        }
      }

      const publicKey = await fetchVapidPublicKey();
      if (!publicKey) {
        return {
          ok: false,
          code: "SERVICE_WORKER_NOT_READY",
          reason: "The server isn't configured for push alerts yet.",
        };
      }

      const reg = await ensureServiceWorker();
      if (!reg) {
        return {
          ok: false,
          code: "SERVICE_WORKER_NOT_READY",
          reason:
            "Couldn't attach to the app's background worker. Close and reopen the app, then try again.",
        };
      }

      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          const currentKey = base64UrlOf(existing.options.applicationServerKey);
          if (currentKey && currentKey !== publicKey.replace(/=+$/, "")) {
            // Old FCM-era subscription — swap it for the current VAPID one.
            await existing.unsubscribe().catch(() => {});
          } else {
            await registerSubscription(existing);
            return { ok: true };
          }
        }
        const sub = await subscribeWithRetry(reg, publicKey);
        await registerSubscription(sub);
        return { ok: true };
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name === "NotSupportedError" || (err as { message?: string })?.message?.includes("unsupported")) {
          return {
            ok: false,
            code: "PUSH_NOT_SUPPORTED",
            reason: isIosPwa()
              ? "Push needs the PWA installed from the Home Screen (iOS 16.4+)."
              : "Push alerts aren't supported on this device.",
          };
        }
        if (name === "AbortError") {
          return {
            ok: false,
            code: "SUBSCRIPTION_FAILED",
            reason: "Your browser cancelled the push setup — usually a brief hiccup. Refresh the page and try again.",
          };
        }
        return {
          ok: false,
          code: "SUBSCRIPTION_FAILED",
          // No raw error name in the copy — it's browser jargon that means
          // nothing to a user. `name` is still logged for debugging.
          reason: "Couldn't turn on reminders for this device. Check your connection and try again.",
        };
      }
    } finally {
      enablePushInFlight = null;
    }
  })();
  return enablePushInFlight;
}

async function registerSubscription(
  sub: PushSubscription
): Promise<void> {
  const meta = detectPlatform();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.toJSON().keys!.p256dh, auth: sub.toJSON().keys!.auth },
      timezone,
      userAgent: meta.userAgent,
      device: meta.device,
      platform: meta.platform,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    if (data?.error === "INVALID_SUBSCRIPTION") throw new Error("INVALID_SUBSCRIPTION");
    throw new Error("NETWORK_ERROR");
  }
}

/** Unsubscribe this device locally and remove its server record. */
export async function disablePush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, code: "PUSH_NOT_SUPPORTED", reason: "Push isn't supported on this browser." };
  }
  try {
    const reg = await ensureServiceWorker();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub?.endpoint;
    if (sub) await sub.unsubscribe().catch(() => {});
    if (endpoint) {
      const res = await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok && res.status !== 401) {
        return { ok: false, code: "NETWORK_ERROR", reason: "Couldn't reach the server. Try again." };
      }
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/** Send a test push to every device this user subscribed on. */
export async function sendTestPush(): Promise<PushResult> {
  try {
    const res = await fetch("/api/notifications/test", { method: "POST" });
    const data = (await res.json().catch(() => null)) as { error?: string; sent?: number } | null;
    if (!res.ok) {
      if (res.status === 401) return { ok: false, code: "UNAUTHORIZED", reason: "You've been signed out. Sign in again." };
      if (data?.error === "NO_SUBSCRIPTIONS") {
        return { ok: false, code: "INVALID_SUBSCRIPTION", reason: "Enable notifications first." };
      }
      return { ok: false, code: "PUSH_SEND_FAILED", reason: "The push couldn't be sent. Try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "NETWORK_ERROR", reason: "Couldn't reach the server. Try again." };
  }
}