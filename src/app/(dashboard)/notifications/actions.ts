"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { notificationService } from "@/server/services/notification.service";
import { cleanupClassReminderList } from "@/server/services/class-reminder-notify";
import { auditLog } from "@/server/lib/audit";

export async function getUserNotifications() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  try {
    // Tidy class-reminder floods (legacy duplicates / per-title backlog).
    await cleanupClassReminderList(session.user.id);
    return await notificationService.getByUser(session.user.id);
  } catch {
    return [];
  }
}

const unreadCache = new Map<string, { count: number; expires: number }>();
const CONCURRENT = new Map<string, Promise<number>>();

export async function getUnreadNotificationCount(): Promise<number> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return 0;
  const userId = session.user.id;
  const now = Date.now();

  // Deduplicate concurrent calls for the same user.
  const pending = CONCURRENT.get(userId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      // Fast in-memory cache (5s TTL).
      const mem = unreadCache.get(userId);
      if (mem && mem.expires > now) return mem.count;

      // Try Redis cache (15s TTL).
      try {
        const { getRedis } = await import("@/server/lib/redis");
        const redis = getRedis();
        const cached = await redis.get(`notif:unread:${userId}`);
        if (cached !== null) {
          const count = Number(cached);
          unreadCache.set(userId, { count, expires: now + 5_000 });
          return count;
        }
      } catch {}

      // Cache miss — hit DB.
      const count = await notificationService.countUnread(userId);

      // Write to both caches.
      try {
        const { getRedis } = await import("@/server/lib/redis");
        await getRedis().set(`notif:unread:${userId}`, String(count), "EX", 15);
      } catch {}
      unreadCache.set(userId, { count, expires: now + 5_000 });

      return count;
    } finally {
      CONCURRENT.delete(userId);
    }
  })();

  CONCURRENT.set(userId, promise);
  return promise;
}

export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };
  try {
    await notificationService.markAsRead(id);
    unreadCache.delete(session.user.id);
    try {
      const { getRedis } = await import("@/server/lib/redis");
      await getRedis().del(`notif:unread:${session.user.id}`);
    } catch {}
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };
  try {
    await notificationService.markAllAsRead(session.user.id);
    unreadCache.delete(session.user.id);
    try {
      const { getRedis } = await import("@/server/lib/redis");
      await getRedis().del(`notif:unread:${session.user.id}`);
    } catch {}
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function deleteNotification(id: string): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };
  try {
    await notificationService.delete(id);
    auditLog("notification.delete", { userId: session.user.id, notificationId: id });
    return { success: true };
  } catch {
    return { success: false };
  }
}
