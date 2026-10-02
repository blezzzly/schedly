import { db } from "@/server/db/client";

/** How many class-reminder notifications to keep in the in-app list, per
 *  title. The user asked for roughly 3 "Upcoming class" + 3 "Class starting
 *  now" entries at most — anything older is pruned on the next reminder. */
const MAX_PER_TITLE = 3;

const CLASS_REMINDER_TITLES = ["Upcoming class", "Class starting now"] as const;
type ClassReminderTitle = (typeof CLASS_REMINDER_TITLES)[number];

/**
 * Create (or refresh) the in-app notification for a class reminder, deduped
 * per (user, title, occurrence) so the same class never stacks N identical
 * entries regardless of which path delivered it:
 *
 *  - QStash exact-time "pre"/"start" messages
 *  - the daily cron dispatcher (catch-up + heads-up sections)
 *  - duplicate schedules / re-imports that created several class+reminder rows
 *
 * Returns `{ fresh }` — `true` when this occurrence was newly recorded (the
 *  caller should deliver the OS push), `false` when one already exists (a
 *  duplicate delivery; the caller should stay silent so the user is only
 *  notified once per class occurrence).
 */
export async function upsertClassReminderNotification(
  userId: string,
  title: ClassReminderTitle,
  body: string,
  scheduledAt: Date,
): Promise<{ fresh: boolean }> {
  const match = { userId, type: "class_reminder" as const, title, scheduledAt };
  const newest = await db.notification.findFirst({
    where: match,
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (newest) {
    // Collapse legacy duplicates for this exact occurrence, keep the newest.
    await db.notification.deleteMany({
      where: { ...match, id: { not: newest.id } },
    });
    return { fresh: false };
  }

  await db.notification.create({ data: { ...match, body } });

  // Keep the list short: only the MAX_PER_TITLE most recent of this title.
  const keep = await db.notification.findMany({
    where: { userId, type: "class_reminder", title },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: MAX_PER_TITLE,
  });
  await db.notification.deleteMany({
    where: {
      userId,
      type: "class_reminder",
      title,
      id: { notIn: keep.map((k) => k.id) },
    },
  });

  return { fresh: true };
}

/**
 * One-time tidy for notification lists created before dedup was added: collapse
 * legacy duplicate class-reminder entries that share the exact same
 * (title, occurrence) and cap the per-title backlog to MAX_PER_TITLE. Runs on
 * the notifications page load so existing floods get cleaned up naturally
 * (no manual clearing needed).
 */
export async function cleanupClassReminderList(userId: string): Promise<void> {
  const rows = await db.notification.findMany({
    where: { userId, type: "class_reminder" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, scheduledAt: true },
  });
  if (rows.length === 0) return;

  // Keep only the newest row per (title, occurrence); drop the rest.
  const keep = new Set<string>();
  const firstSeen = new Set<string>();
  for (const r of rows) {
    const key = `${r.title}|${r.scheduledAt?.getTime() ?? ""}`;
    if (!firstSeen.has(key)) {
      firstSeen.add(key);
      keep.add(r.id);
    }
  }
  const drop = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (drop.length > 0) {
    await db.notification.deleteMany({ where: { id: { in: drop } } });
  }

  // Cap the backlog per title (3 "Upcoming class" + 3 "Class starting now").
  for (const title of CLASS_REMINDER_TITLES) {
    const recent = await db.notification.findMany({
      where: { userId, type: "class_reminder", title },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      take: MAX_PER_TITLE,
    });
    if (recent.length === 0) continue;
    await db.notification.deleteMany({
      where: {
        userId,
        type: "class_reminder",
        title,
        id: { notIn: recent.map((r) => r.id) },
      },
    });
  }
}
