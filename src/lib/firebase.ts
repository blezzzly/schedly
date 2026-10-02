"use client";

/* Client-side Firebase Cloud Messaging helpers: obtain an FCM token using
 * the messaging SDK and register it server-side, mirroring the CodeQuest
 * setup that delivers pushes even when Schedly isn't open. */

export type PushResult =
  | { ok: true }
  | { ok: false; reason: string };

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
    Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY)
  );
}

/** Human-readable reasons this environment can't use push. */
export function pushUnsupportedReasons(): string[] {
  const reasons: string[] = [];
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    reasons.push("This browser has no Service Worker support");
  }
  if (!("Notification" in window)) {
    reasons.push("The Notification API isn't available (common in Android app WebViews)");
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    reasons.push("Missing NEXT_PUBLIC_FIREBASE_API_KEY (restart the dev server)");
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
    reasons.push("Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY (restart the dev server)");
  }
  return reasons;
}

function base64UrlOf(array: ArrayBuffer | ArrayBufferView | null | undefined): string | null {
  if (array == null) return null;
  const bytes = array instanceof ArrayBuffer ? new Uint8Array(array) : new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True when the stored push subscription was created for the current FCM
 *  project's VAPID key — i.e. it's an FCM subscription, not a legacy
 *  web-push (old .env.local VAPID) one. Stale legacy subscriptions are
 *  cleaned up so the toggle stays OFF until the user opts in. */
export async function hasFcmSubscription(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const key = base64UrlOf(sub.options.applicationServerKey);
    const expect = (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "").replace(/=+$/, "");
    if (key && key === expect) return true;
    await sub.unsubscribe().catch(() => {});
    return false;
  } catch {
    return false;
  }
}

function getFcmConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };
}

/** Ensure the app's service worker is registered and current so push events
 *  (and the FCM token request) have a handler to target. */
export async function ensureFcmRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    // Same URL as src/lib/push.ts: `?dev=1` in development so the worker skips
    // all caching there (dev chunk URLs change on every restart, and a
    // cache-first worker would serve stale modules). Keep the two in sync.
    const swUrl = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";
    const existing = await navigator.serviceWorker.getRegistration("/");
    let reg = existing && existing.active ? existing : null;
    if (!reg) {
      reg = await navigator.serviceWorker.register(swUrl, {
        updateViaCache: "none",
      });
    }
    await reg.update().catch(() => {});
    return reg;
  } catch {
    return null;
  }
}

/** Show FCM pushes while the app is in the foreground. FCM delivers
 *  foreground messages to `messaging.onMessage` (the service worker only gets
 *  background ones), so without this handler nothing renders when the page is
 *  open — e.g. an admin broadcasting to themselves from the dashboard.
 *  Background messages keep flowing through the SW's own push listener. */
export async function listenForForegroundMessages(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
    const supported = await isSupported().catch(() => false);
    if (!supported) return;

    const config = getFcmConfig();
    if (!config.apiKey) return;
    if (getApps().length === 0) initializeApp(config);

    let messaging;
    try {
      messaging = getMessaging(getApps()[0]!);
    } catch {
      // messaging/unsupported-browser: isSupported() passed but getMessaging() still
      // throws on some browsers (iOS Safari, embedded WebViews, etc.).
      return;
    }

    onMessage(messaging, (payload) => {
      const data = payload.data || {};
      const title = payload.notification?.title || data.title || "Schedly";
      const body = payload.notification?.body || data.body || "";
      const url = data.url || "/";
      navigator.serviceWorker?.ready
        .then((reg) =>
          reg.showNotification(title, {
            body,
            icon: "/icons/icon-192.png",
            badge: "/notif-icon.svg",
            data: { url },
            tag: data.tag || `schedly-${Date.now()}`,
          })
        )
        .catch(() => {});
    });
  } catch {
    // Foreground push is best-effort; background delivery still works.
  }
}

/** Get an FCM token via the messaging SDK and register it with the server. */
export async function subscribeToPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "Push isn't supported on this browser." };
  }
  if (Notification.permission === "denied") {
    return {
      ok: false,
      reason:
        "Notifications are blocked on this device. Enable them in your browser or phone settings, then try again.",
    };
  }
  if (Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      return {
        ok: false,
        reason: "Notification permission wasn't granted.",
      };
    }
  }

  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");

    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return {
        ok: false,
        reason:
          "Push alerts aren't supported on this browser/device. Use Chrome on Android or install the PWA.",
      };
    }

    const reg = await ensureFcmRegistration();
    if (!reg) {
      return {
        ok: false,
        reason:
          "Couldn't attach to the app's background worker. Close and reopen the app, then try again.",
      };
    }

    const config = getFcmConfig();
    if (!config.apiKey) {
      return {
        ok: false,
        reason: "The server isn't configured for push alerts yet.",
      };
    }
    if (getApps().length === 0) initializeApp(config);
    const app = getApps()[0]!;

    let messaging;
    try {
      messaging = getMessaging(app);
    } catch {
      return {
        ok: false,
        reason: "Push alerts aren't supported on this browser/device. Use Chrome on Android or install the PWA.",
      };
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      return {
        ok: false,
        reason: "The server isn't configured for push alerts yet.",
      };
    }
    // Validate VAPID key format (base64url, should decode to 65 bytes for EC P-256)
    try {
      const clean = vapidKey.replace(/=+$/, "");
      if (!/^[A-Za-z0-9_-]+$/.test(clean) || clean.length < 80) {
        console.warn("[FCM] VAPID key looks malformed:", clean.slice(0, 12) + "...");
      }
    } catch (e) {
      console.warn("[FCM] VAPID key decode failed:", e);
    }

    let token: string;
    try {
      token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const msg = (err as { message?: string })?.message || "";
      if (name === "InvalidAccessError" || name === "InvalidCharacterError" || (msg.includes("invalid") && msg.includes("key"))) {
        return {
          ok: false,
          reason: "The server's FCM push key is invalid or doesn't match the Firebase project. Check NEXT_PUBLIC_FIREBASE_VAPID_KEY in Vercel env vars.",
        };
      }
      if (
        name === "NotSupportedError" ||
        name === "AbortError" ||
        (err as { message?: string })?.message?.includes("unsupported")
      ) {
        return {
          ok: false,
          reason:
            "Push alerts aren't supported on this device. On Android, use Chrome — not the in-app browser.",
        };
      }
      return {
        ok: false,
        reason: "Couldn't turn on reminders for this device. Check your connection and try again.",
      };
    }

    if (!token) {
      return {
        ok: false,
        reason: "Couldn't get a push token from this device. Try again.",
      };
    }

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch("/api/push/fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, timezone }),
      });
      if (!res.ok) {
        return {
          ok: false,
          reason:
            "This device subscribed, but the server couldn't save it. Check your connection and try again.",
        };
      }
    } catch {
      return {
        ok: false,
        reason: "Couldn't save the push token. Check your connection and try again.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "Couldn't turn on reminders for this device. Check your connection and try again.",
    };
  }
}

export async function unsubscribeFromFcm(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "Unsupported on this browser." };
  }
  try {
    const { getApps } = await import("firebase/app");
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    if (getApps().length > 0) {
      try {
        await deleteToken(getMessaging(getApps()[0]!)).catch(() => {});
      } catch {
        // Best-effort token cleanup.
      }
    }
    // Server-side: remove all FCM tokens for this user's session.
    await fetch("/api/push/fcm-token", { method: "DELETE", headers: { "Content-Type": "application/json" } })
      .catch(() => {});
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe().catch(() => {});
    } catch {
      // Legacy subscription cleanup is best-effort.
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Couldn't unsubscribe this device." };
  }
}