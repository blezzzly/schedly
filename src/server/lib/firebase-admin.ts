import admin from "firebase-admin";
import { getMessaging as getFCMessaging } from "firebase-admin/messaging";
import type { App } from "firebase-admin/app";
import { db } from "@/server/db/client";

export function getAdminApp() {
  const adminApps = typeof admin.getApps === "function" ? admin.getApps() : (admin as { apps?: Array<unknown> }).apps ?? [];
  if (adminApps.length > 0) return adminApps[0] as App;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;

  const certFn =
    (admin as unknown as { cert?: (opts: object) => unknown }).cert ??
    (admin as unknown as { credential?: { cert: (opts: object) => unknown } }).credential?.cert;
  if (!certFn) return null;

  try {
    return admin.initializeApp({
      credential: certFn({ projectId, clientEmail, privateKey }) as App["options"]["credential"],
      projectId,
    });
  } catch {
    return null;
  }
}

export function getMessaging() {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getFCMessaging(app);
  } catch {
    return null;
  }
}

/** True when FIREBASE_ADMIN_* env vars are present (FCM sending available). */
export function isFcmConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );
}

interface FcmPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send a push via Firebase Cloud Messaging (HTTP v1) to every token the user
 *  has registered. Removes tokens Firebase marks as dead. */
export async function sendFCMPush({ userId, title, body, url, tag }: FcmPayload) {
  let sent = 0;
  let failed = 0;
  const errors: unknown[] = [];

  const tokens = await db.fCMToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });
  if (tokens.length === 0) return { sent, failed, tokens: 0, errors };

  const messaging = getMessaging();
  if (!messaging) return { sent, failed, tokens: tokens.length, errors };

  // Data-only payload: the browser routes foreground messages to the page's
  // onMessage handler and background messages to the service worker's push
  // listener. A top-level `notification` would make display browser-dependent
  // and drop foreground messages entirely (no onMessage handler for it).
  const message = {
    data: {
      title,
      body,
      url: url || "/",
      tag: tag || `schedly-${Date.now()}`,
    },
    webpush: {
      headers: { Urgency: "high" },
    },
  };

  await Promise.allSettled(
    tokens.map(async (t) => {
      try {
        await messaging.send({ ...message, token: t.token });
        sent++;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await db.fCMToken.delete({ where: { id: t.id } }).catch(() => {});
        } else {
          failed++;
          errors.push({ code, message: (err as { message?: string })?.message });
        }
      }
    })
  );

  return { sent, failed, tokens: tokens.length, errors };
}