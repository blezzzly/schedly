import { db } from "@/server/db/client";
import { sendPush, isVapidConfigured } from "@/server/lib/web-push";
import { sendFCMPush, isFcmConfigured } from "@/server/lib/firebase-admin";

/** Local calendar date (YYYY-MM-DD) of `at` in the given timezone. */
function localDateKey(timezone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    const y = at.getFullYear();
    const m = String(at.getMonth() + 1).padStart(2, "0");
    const d = String(at.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

/**
 * Send "task deadline" reminders for the user's to-dos whose due date is
 * today or already overdue. Deduped per (user, title, body) so each task is
 * reminded once per due date — editing the text or moving the due date to a
 * new day creates a new body and fires a fresh reminder on the new day.
 *
 * Runs from the client heartbeat while the app is open and from the daily
 * cron (all users) as the safety net when it's closed. QStash isn't used —
 * exact-time delivery isn't needed for "due today" semantics.
 */
export async function dispatchTodoDeadlines(now: Date = new Date(), userId?: string) {
  if (!isVapidConfigured() && !isFcmConfigured()) return { sent: 0, checked: 0 };

  const todos = await db.todo.findMany({
    where: {
      completed: false,
      dueDate: { not: null },
      ...(userId ? { userId } : {}),
    },
    include: {
      user: { select: { id: true, timezone: true } },
    },
  });
  if (todos.length === 0) return { sent: 0, checked: 0 };

  const userIds = [...new Set(todos.map((t) => t.userId))];

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  const subRows = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  for (const sub of subRows) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    subsByUser.set(sub.userId, list);
  }

  const fcmTokensByUser = new Map<string, number>();
  const fcmRows = await db.fCMToken.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
  });
  for (const row of fcmRows) {
    fcmTokensByUser.set(row.userId, (fcmTokensByUser.get(row.userId) ?? 0) + 1);
  }

  const deliverPush = async (
    todoUserId: string,
    title: string,
    body: string
  ): Promise<string[]> => {
    const subs = subsByUser.get(todoUserId) ?? [];
    const stale: string[] = [];
    if (subs.length > 0) {
      await Promise.all(
        subs.map(async (sub) => {
          const result = await sendPush(sub, { title, body, url: "/todo" });
          if (result.stale) stale.push(sub.endpoint);
        })
      );
      return stale;
    }
    if ((fcmTokensByUser.get(todoUserId) ?? 0) > 0) {
      await sendFCMPush({ userId: todoUserId, title, body, url: "/todo" });
    }
    return stale;
  };

  let sent = 0;
  const staleEndpoints: string[] = [];

  for (const todo of todos) {
    const dueDate = todo.dueDate!;
    const tz = todo.user.timezone || "Asia/Manila";
    const today = localDateKey(tz, now);
    if (dueDate > today) continue;

    const overdue = dueDate < today;
    const title = overdue ? "Task overdue" : "Task due today";
    const body = overdue
      ? `Overdue: "${todo.text}" (was due ${dueDate})`
      : `"${todo.text}" is due today.`;

    // Dedup per (user, title, body) so each task fires exactly one reminder
    // per due date, regardless of how often the heartbeat/cron polls.
    const existing = await db.notification.findFirst({
      where: { userId: todo.userId, type: "system", title, body },
      select: { id: true },
    });
    if (existing) continue;

    await db.notification.create({
      data: { userId: todo.userId, type: "system", title, body },
    });

    staleEndpoints.push(...(await deliverPush(todo.userId, title, body)));
    sent++;
  }

  if (staleEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return { sent, checked: todos.length };
}
