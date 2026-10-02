import { db } from "@/server/db/client";
import { sendPush, type PushNotificationPayload } from "@/server/lib/web-push";

/**
 * Push notification infrastructure for Schedly.
 *
 * One web-push subscription per device, stored per user, delivered through
 * the browser's native push service (VAPID). Expired subscriptions (410/404)
 * are removed automatically while every other device still receives the
 * payload.
 */

export type { PushNotificationPayload };

export interface PushSendResult {
  sent: number;
  failed: number;
  removed: number;
  devices: number;
}

const MAX_PAYLOAD_BYTES = 3072;

export function validatePushPayload(payload: unknown): PushNotificationPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.title !== "string" || !p.title || typeof p.body !== "string") return null;
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return null;
  return {
    title: p.title.slice(0, 120),
    body: p.body.slice(0, 500),
    icon: typeof p.icon === "string" ? p.icon.slice(0, 500) : undefined,
    badge: typeof p.badge === "string" ? p.badge.slice(0, 500) : undefined,
    url: typeof p.url === "string" ? p.url.slice(0, 500) : undefined,
    tag: typeof p.tag === "string" ? p.tag.slice(0, 100) : undefined,
    data: p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : undefined,
  };
}

/** Subscription payload accepted from the browser after it calls
 *  pushManager.subscribe(). */
export interface SaveSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone?: string;
  userAgent?: string;
  device?: string;
  platform?: string;
}

export function validateSubscriptionInput(body: unknown): SaveSubscriptionInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : "";
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth) return null;
  if (endpoint.length > 1000 || p256dh.length > 1000 || auth.length > 500) return null;
  return {
    endpoint,
    p256dh,
    auth,
    timezone: typeof b.timezone === "string" ? b.timezone.slice(0, 64) : "Asia/Manila",
    userAgent: typeof b.userAgent === "string" ? b.userAgent.slice(0, 300) : undefined,
    device: typeof b.device === "string" ? b.device.slice(0, 100) : undefined,
    platform: typeof b.platform === "string" ? b.platform.slice(0, 100) : undefined,
  };
}

/** Upsert one device subscription for an authenticated user, and keep the
 *  user's timezone in sync (a stale UTC default shifts every reminder). */
export async function savePushSubscription(userId: string, input: SaveSubscriptionInput) {
  return db.$transaction(async (tx) => {
    const t = tx as typeof db;
    const sub = await t.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        timezone: input.timezone ?? "Asia/Manila",
        userAgent: input.userAgent,
        device: input.device,
        platform: input.platform,
      },
      update: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        timezone: input.timezone ?? "Asia/Manila",
        userAgent: input.userAgent,
        device: input.device,
        platform: input.platform,
      },
    });

    if (input.timezone && input.timezone !== "UTC") {
      await t.user.updateMany({
        where: { id: userId },
        data: { timezone: input.timezone },
      });
    }
    return sub;
  });
}

/** Remove one device subscription. Idempotent — missing rows are fine. */
export async function deletePushSubscription(userId: string, endpoint?: string) {
  if (endpoint) {
    await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
  } else {
    // No endpoint given (e.g. signed-out cleanup): drop every subscription.
    await db.pushSubscription.deleteMany({ where: { userId } });
  }
}

/** Fan out a payload to every device the user is subscribed on. One stale
 *  endpoint must not block the rest; 410/404 subscriptions are removed. */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<PushSendResult> {
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  const result: PushSendResult = { sent: 0, failed: 0, removed: 0, devices: subs.length };

  if (subs.length === 0) return result;

  const staleEndpoints: string[] = [];
  const outcomes = await Promise.allSettled(
    subs.map((sub) =>
      sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload)
    )
  );

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i]!;
    if (outcome.status === "rejected") {
      result.failed++;
      continue;
    }
    const res = outcome.value;
    if (res.ok) {
      result.sent++;
    } else if (res.stale) {
      result.removed++;
      staleEndpoints.push(subs[i]!.endpoint);
    } else {
      result.failed++;
    }
  }

  if (staleEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return result;
}

export const TEST_PUSH_PAYLOAD: PushNotificationPayload = {
  title: "Schedly Test Notification",
  body: "Your push notifications are working correctly.",
  icon: "/icons/icon-192.png",
  badge: "/notif-icon.svg",
  url: "/notifications",
  tag: "schedly-test",
};
