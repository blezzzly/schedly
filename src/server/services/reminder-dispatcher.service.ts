import { db } from "@/server/db/client";
import { sendPush, isVapidConfigured } from "@/server/lib/web-push";
import { sendFCMPush, isFcmConfigured } from "@/server/lib/firebase-admin";
import { upsertClassReminderNotification } from "@/server/services/class-reminder-notify";
import type { DayOfWeek } from "@/generated/prisma/client";

const DAYS_OF_WEEK: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Wall-clock hour/minute of a stored class time. Class times are saved with
 *  UTC components carrying the intended local wall clock (see parseTime). */
function wallParts(d: Date): { h: number; m: number } {
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

/** Local calendar date + UTC offset of `at` in the given timezone. The wall
 *  clock stored in start_time is the user's local time, so the occurrence
 *  instant must be built from the LOCAL date — not the UTC date, which drifts
 *  by up to a day (e.g. at 18:00 UTC it's already 02:00 the next day in
 *  Asia/Manila). */
function localParts(timezone: string, at: Date): {
  y: number;
  mo: number;
  d: number;
  offsetMs: number;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return { y: get("year"), mo: get("month"), d: get("day"), offsetMs: asUtc - at.getTime() };
  } catch {
    // A corrupt/invalid timezone stored in the DB must never crash the whole
    // cron — fall back to the instant's UTC wall clock so that one bad row is
    // just skipped instead of 500-ing every dispatch run.
    return {
      y: at.getUTCFullYear(),
      mo: at.getUTCMonth() + 1,
      d: at.getUTCDate(),
      offsetMs: 0,
    };
  }
}

/** Local weekday (0=Sunday) of `at` in the given timezone. */
function localWeekday(timezone: string, at: Date): number {
  try {
    const key = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(at);
    const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(key);
    return idx >= 0 ? idx : at.getUTCDay();
  } catch {
    return at.getUTCDay();
  }
}

/** Next occurrence (epoch ms, strictly after `now`) of a class that falls on
 *  `days`, interpreted as wall-clock hh:mm in the user's timezone. */
export function nextOccurrence(
  startTime: Date,
  days: DayOfWeek[],
  timezone: string,
  now: Date
): number | null {
  return nearestOccurrence(startTime, days, timezone, now, true);
}

/** Latest occurrence (epoch ms, at or before `now`) — lets a delayed cron
 *  still catch an occurrence that already started instead of skipping to the
 *  next week. */
export function lastOccurrence(
  startTime: Date,
  days: DayOfWeek[],
  timezone: string,
  now: Date
): number | null {
  return nearestOccurrence(startTime, days, timezone, now, false);
}

/** The occurrence (epoch ms) on the LOCAL calendar date of `now` — i.e. the
 *  class on "today" in the user's timezone, or null when today isn't a class
 *  day. Used by the daily cron to deliver a reliable push for every class
 *  still ahead today. */
function occurrenceToday(
  startTime: Date,
  days: DayOfWeek[],
  timezone: string,
  now: Date
): number | null {
  const tz = timezone || "Asia/Manila";
  const weekday = localWeekday(tz, now);
  if (!days.includes(DAYS_OF_WEEK[weekday]!)) return null;
  const { h, m } = wallParts(startTime);
  const lp = localParts(tz, now);
  return Date.UTC(lp.y, lp.mo - 1, lp.d, h, m) - lp.offsetMs;
}

function nearestOccurrence(
  startTime: Date,
  days: DayOfWeek[],
  timezone: string,
  now: Date,
  future: boolean
): number | null {
  const { h, m } = wallParts(startTime);
  const tz = timezone || "Asia/Manila";
  const step = future ? 1 : -1;
  let best: number | null = null;

  for (let i = 0; i <= 14; i++) {
    const probe = new Date(now.getTime() + step * i * 24 * 60 * 60 * 1000);
    const localKey = DAYS_OF_WEEK[localWeekday(tz, probe)]!;
    if (!days.includes(localKey)) continue;

    const lp = localParts(tz, probe);
    const instant = Date.UTC(lp.y, lp.mo - 1, lp.d, h, m) - lp.offsetMs;
    if (future) {
      if (instant > now.getTime()) return instant;
    } else if (instant <= now.getTime()) {
      best = best === null ? instant : Math.max(best, instant);
    }
  }
  return best;
}

export async function dispatchDueReminders(now: Date = new Date(), userId?: string) {
  if (!isVapidConfigured() && !isFcmConfigured()) return { sent: 0, checked: 0 };

  const reminders = await db.reminder.findMany({
    where: { isActive: true, ...(userId ? { userId } : {}) },
    include: {
      class: { include: { schedule: true } },
      user: { select: { id: true, timezone: true, reminderStartDate: true } },
    },
  });

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  const subRows = await db.pushSubscription.findMany(userId ? { where: { userId } } : undefined);
  for (const sub of subRows) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
    subsByUser.set(sub.userId, list);
  }

  const fcmTokensByUser = new Map<string, number>();
  const fcmRows = await db.fCMToken.findMany({
    ...(userId ? { where: { userId } } : {}),
    select: { userId: true },
  });
  for (const row of fcmRows) {
    fcmTokensByUser.set(row.userId, (fcmTokensByUser.get(row.userId) ?? 0) + 1);
  }

  // Native Web Push (VAPID) is the primary channel; FCM remains the fallback
  // for devices subscribed before the migration.
  const deliverPush = async (
    reminderUserId: string,
    title: string,
    body: string
  ): Promise<string[]> => {
    const subs = subsByUser.get(reminderUserId) ?? [];
    const stale: string[] = [];
    if (subs.length > 0) {
      await Promise.all(
        subs.map(async (sub) => {
          const result = await sendPush(sub, { title, body, url: "/classes" });
          if (result.stale) stale.push(sub.endpoint);
        })
      );
      return stale;
    }
    if ((fcmTokensByUser.get(reminderUserId) ?? 0) > 0) {
      await sendFCMPush({ userId: reminderUserId, title, body, url: "/classes" });
    }
    return stale;
  };

  let sent = 0;
  const staleEndpoints: string[] = [];
  // Grace period after a class starts: a delayed cron can still deliver the
  // "starting now" push during this window instead of skipping the occurrence.
  const START_CATCHUP_MS = 90 * 60 * 1000;

  // The same class often exists in several schedules (re-imports, semester
  // copies), each with its own Reminder row. Group every reminder by
  // (user, occurrence) so one class still produces exactly ONE "upcoming"
  // push and ONE "starting now" push — duplicates inside the group are
  // silenced AND marked so later runs stay quiet too.
  interface DispatchRow {
    reminderId: string;
    minutes: number;
    lastSentAt: number | null;
    lastStartSentAt: number | null;
    occNext: number | null;
    occPrev: number | null;
    occToday: number | null;
    label: string;
    startLabelTxt: string;
  }

  const groups = {
    upcoming: new Map<string, DispatchRow[]>(), // key: user|occNext|minutes
    start: new Map<string, DispatchRow[]>(),    // key: user|occPrev
    today: new Map<string, DispatchRow[]>(),    // key: user|occToday|minutes
  };

  for (const reminder of reminders) {
    const cls = reminder.class;
    const label = cls.shortName?.trim() || cls.code?.trim() || cls.subject;
    const tz = reminder.user.timezone || "Asia/Manila";
    const occNext = nextOccurrence(cls.startTime, cls.days as DayOfWeek[], tz, now);
    const occPrev = lastOccurrence(cls.startTime, cls.days as DayOfWeek[], tz, now);
    const occToday = occurrenceToday(cls.startTime, cls.days as DayOfWeek[], tz, now);

    // Skip reminders if before the user's reminder start date
    if (reminder.user.reminderStartDate) {
      const startDate = new Date(reminder.user.reminderStartDate);
      startDate.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      if (today < startDate) continue;
    }

    const row: DispatchRow = {
      reminderId: reminder.id,
      minutes: reminder.minutesBefore,
      lastSentAt: reminder.lastSentAt ? reminder.lastSentAt.getTime() : null,
      lastStartSentAt: reminder.lastStartSentAt ? reminder.lastStartSentAt.getTime() : null,
      occNext,
      occPrev,
      occToday,
      label,
      startLabelTxt: startLabel(cls.startTime),
    };

    if (occNext !== null) {
      const key = `${reminder.userId}|${occNext}|${reminder.minutesBefore}`;
      const list = groups.upcoming.get(key) ?? [];
      list.push(row);
      groups.upcoming.set(key, list);
    }
    if (occPrev !== null) {
      const key = `${reminder.userId}|${occPrev}`;
      const list = groups.start.get(key) ?? [];
      list.push(row);
      groups.start.set(key, list);
    }
    if (occToday !== null) {
      const key = `${reminder.userId}|${occToday}|${reminder.minutesBefore}`;
      const list = groups.today.get(key) ?? [];
      list.push(row);
      groups.today.set(key, list);
    }
  }

  const alreadySent = (rows: DispatchRow[], occ: number) =>
    rows.some((r) => r.lastSentAt !== null && r.lastSentAt >= occ);
  const alreadyStarted = (rows: DispatchRow[], occ: number) =>
    rows.some((r) => r.lastStartSentAt !== null && r.lastStartSentAt >= occ);

  // 1) "Upcoming" push: now is between [occurrence - minutesBefore] and the
  //    class start. Catch-up semantics — a delayed cron fires this as long
  //    as the class hasn't started yet (no fixed end-of-window).
  for (const [key, rows] of groups.upcoming) {
    const occ = rows[0]!.occNext!;
    const userId = key.split("|")[0]!;
    const minutes = rows[0]!.minutes;
    if (now.getTime() < occ - minutes * 60 * 1000) continue;
    if (alreadySent(rows, occ)) continue;

    const remaining = Math.max(0, Math.round((occ - now.getTime()) / 60000));
    // Dedupe across delivery paths — if QStash already recorded this
    // occurrence, the daily cron must not stack a second "Upcoming class".
    const { fresh } = await upsertClassReminderNotification(
      userId,
      "Upcoming class",
      `Reminder: ${rows[0]!.label} starts in ${remaining} min.`,
      new Date(occ),
    );
    if (!fresh) continue;

    staleEndpoints.push(
      ...(await deliverPush(
        userId,
        "Upcoming class",
        remaining > 0
          ? `${rows[0]!.label} starts in ${remaining} min (${rows[0]!.startLabelTxt})`
          : `${rows[0]!.label} starts now (${rows[0]!.startLabelTxt})`
      ))
    );

    // Mark EVERY duplicate row for this occurrence — otherwise each copy of
    // the class in other schedules fires its own push.
    await db.reminder.updateMany({
      where: { id: { in: rows.map((r) => r.reminderId) } },
      data: { lastSentAt: new Date(occ) },
    });

    sent++;
  }

  // 2) "Starting now" push: the most recent occurrence is current (within
  //    the catch-up grace), so a delayed cron still reports it. Deduped per
  //    (user, occurrence) — the exact-time "start" QStash message and local
  //    alarms both write lastStartSentAt, so each class starts once.
  for (const [key, rows] of groups.start) {
    const occPrev = rows[0]!.occPrev!;
    const userId = key.split("|")[0]!;
    if (now.getTime() > occPrev + START_CATCHUP_MS) continue;
    // The upcoming window is open for a duplicate row of this occurrence —
    // that push covers it, a "starting now" push would be wrong.
    if (rows.some((r) => r.occNext !== null && now.getTime() >= r.occNext - r.minutes * 60 * 1000)) continue;
    if (alreadyStarted(rows, occPrev)) continue;

    // Dedupe across delivery paths — the exact-time QStash "start" message
    // owns this push; if it already recorded the occurrence, skip.
    const { fresh } = await upsertClassReminderNotification(
      userId,
      "Class starting now",
      `${rows[0]!.label} starts now (${rows[0]!.startLabelTxt})`,
      new Date(occPrev),
    );
    if (!fresh) continue;

    staleEndpoints.push(
      ...(await deliverPush(
        userId,
        "Class starting now",
        `You have class today — ${rows[0]!.label} at ${rows[0]!.startLabelTxt}`
      ))
    );

    await db.reminder.updateMany({
      where: { id: { in: rows.map((r) => r.reminderId) } },
      data: { lastStartSentAt: new Date(occPrev) },
    });

    sent++;
  }

  // 3) "Today's classes" heads-up: with a 1x/day cron we can't be inside
  //    every reminder window, so once a day we reliably deliver a push for
  //    every class still ahead today (works even when the app is closed).
  //    lastSentAt dedupes so each occurrence is reminded once.
  for (const [key, rows] of groups.today) {
    const occToday = rows[0]!.occToday!;
    const userId = key.split("|")[0]!;
    if (occToday <= now.getTime()) continue;
    if (alreadySent(rows, occToday)) continue;

    const remaining = Math.max(0, Math.round((occToday - now.getTime()) / 60000));
    const body =
      remaining > 120
        ? `${rows[0]!.label} at ${rows[0]!.startLabelTxt} today`
        : remaining > 0
          ? `${rows[0]!.label} starts in ${remaining} min (${rows[0]!.startLabelTxt})`
          : `${rows[0]!.label} starts now (${rows[0]!.startLabelTxt})`;

    // The exact-time QStash "pre" message owns the "Upcoming class" push for
    // this occurrence — a same-occurrence heads-up here stays quiet.
    const { fresh } = await upsertClassReminderNotification(
      userId,
      "Upcoming class",
      `Reminder: ${rows[0]!.label} at ${rows[0]!.startLabelTxt} today.`,
      new Date(occToday),
    );
    if (!fresh) continue;

    staleEndpoints.push(...(await deliverPush(userId, "Upcoming class", body)));

    await db.reminder.updateMany({
      where: { id: { in: rows.map((r) => r.reminderId) } },
      data: { lastSentAt: new Date(occToday) },
    });

    sent++;
  }

  if (staleEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return { sent, checked: reminders.length };
}

function startLabel(startTime: Date): string {
  const { h, m } = wallParts(startTime); // stored wall clock == intended wall clock
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export { DAYS_OF_WEEK };