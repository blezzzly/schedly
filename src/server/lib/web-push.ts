import webpush from "web-push";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:support@schedly.app";

export function isVapidConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export function ensureVapidConfigured(): void {
  if (!isVapidConfigured()) {
    throw new Error("VAPID keys are not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
}

export function getVapidPublicKey(): string | null {
  return PUBLIC_KEY ?? null;
}

export interface PushEndpoint {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Strongly typed push payload — rendered by the service worker's push
 *  handler, which falls back to sensible defaults for missing fields. */
export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/** Send a push payload to one subscription. Resolves to false when the
 *  subscription is stale (410/404) and should be removed from the DB. */
export async function sendPush(
  sub: PushEndpoint,
  payload: PushNotificationPayload
): Promise<{ ok: boolean; stale?: boolean }> {
  ensureVapidConfigured();
  try {
    const message = JSON.stringify(payload);
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      message
    );

    // When the server silently ignores 201s/2xx with empty body, web-push
    // treats them as success; anything else surfaces here.
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return { ok: false, stale: res.statusCode === 410 || res.statusCode === 404 };
    }
    return { ok: true, stale: res.statusCode === 410 || res.statusCode === 404 };
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 410 || code === 404) {
      return { ok: false, stale: true };
    }
    if (code && code < 500) {
      return { ok: false, stale: false };
    }
    // Network / push-service downtime: not stale, just transient.
    return { ok: false, stale: false };
  }
}