import { Client, Receiver } from "@upstash/qstash";
import { createHash } from "node:crypto";
import { db } from "@/server/db/client";
import { sendPush, isVapidConfigured } from "@/server/lib/web-push";
import { sendFCMPush, isFcmConfigured } from "@/server/lib/firebase-admin";
import { nextOccurrence, lastOccurrence } from "@/server/services/reminder-dispatcher.service";
import { upsertClassReminderNotification } from "@/server/services/class-reminder-notify";
import { incrementUsage, USAGE_SERVICES } from "@/server/lib/usage-counter";
import type { DayOfWeek } from "@/generated/prisma/client";

/*
 * Exact-time class reminders via Upstash QStash.
 *
 * Vercel Hobby crons run at most once per day (with ±59min precision), so the
 * server can't hit every reminder window by itself. QStash delivers an HTTP
 * request at an exact time, so we schedule two messages per class occurrence:
 *   - "pre"   at [class start - minutesBefore] → the "Upcoming class" push
 *   - "start" at [class start]                 → the "Class starting now" push
 * The `/api/reminders/fire` endpoint turns each into the same push + in-app
 * notification the dispatcher sends.
 *
 * Scheduling is refreshed from three places: the daily cron (everyone, safety
 * net), the client layout after login/navigation (throttled), and the
 * reminder update action (immediately after edits). Delivery is deduped per
 * (user, occurrence) — both server-side (reminders.lastSentAt /
 * lastStartSentAt) and at scheduling time (one message per occurrence even
 * when duplicate schedules/reminders exist) — so re-scheduling and duplicate
 * schedules never double-notify.
 */

let _client: Client | null = null;

// QStash free tier caps how far ahead a message can be scheduled (7 days).
const MAX_DELAY_MS = 604_800_000; // 604800 seconds

function getQStashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  if (!_client) _client = new Client({ token });
  return _client;
}

export function isQstashConfigured(): boolean {
  return Boolean(
    process.env.QSTASH_TOKEN &&
      process.env.QSTASH_CURRENT_SIGNING_KEY &&
      process.env.QSTASH_NEXT_SIGNING_KEY
  );
}

export async function verifyQstashRequest(req: Request, rawBody: string): Promise<boolean> {
  if (!isQstashConfigured()) return true;
  const signature = req.headers.get("upstash-signature") || "";
  if (!signature) return false;
  try {
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
    return await receiver.verify({ signature, body: rawBody });
  } catch (err) {
    console.error("[QSTASH_VERIFY]", err);
    return false;
  }
}

export async function scheduleQstashReminders(
  now: Date = new Date(),
  userId?: string
): Promise<{ scheduled: number; skipped: number; total: number }> {
  const client = getQStashClient();
  if (!client) return { scheduled: 0, skipped: 0, total: 0 };

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    // The deployed origin. Only reached when neither env var is set, which in
    // production means the deployment is misconfigured — but a reminder URL
    // pointing at nothing is worse than one pointing somewhere plausible.
    "https://schedlyapp.vercel.app";

  const reminders = await db.reminder.findMany({
    where: userId ? { isActive: true, userId } : { isActive: true },
    include: {
      class: true,
      user: { select: { id: true, timezone: true, reminderStartDate: true } },
    },
  });

  let scheduled = 0;
  let skipped = 0;

  // One message per (user, class occurrence) even when the same class exists
  // in several schedules — otherwise every duplicate reminder row schedules
  // its own push and the user gets N identical notifications. The class key
  // keeps genuinely different subjects that share a time slot separate.
  const seenPre = new Set<string>();
  const seenStart = new Set<string>();

  // Every publish is a network round-trip; running them sequentially blows
  // the serverless timeout once there are a few hundred reminders. Collect
  // the publishes as tasks and fire them with bounded concurrency instead.
  const CONCURRENCY = 6;
  type PublishOutcome = "scheduled" | "skipped" | "failed";
  const tasks: (() => Promise<PublishOutcome>)[] = [];

  for (const reminder of reminders) {
    const cls = reminder.class;
    if (cls.days.length === 0) continue;

    // Skip reminders if before the user's reminder start date
    if (reminder.user.reminderStartDate) {
      const startDate = new Date(reminder.user.reminderStartDate);
      startDate.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      if (today < startDate) continue;
    }

    const tz = reminder.user.timezone || "Asia/Manila";
    const occ = nextOccurrence(cls.startTime, cls.days as DayOfWeek[], tz, now);
    if (occ === null) continue;

    const minutes = reminder.minutesBefore * 60 * 1000;
    const classKey =
      `${cls.startTime.getTime()}|${cls.endTime.getTime()}|${cls.subject}|${cls.room ?? ""}`;
    const key = `${reminder.userId}:${occ}:${classKey}`;
    // Stable messageId per (user, occurrence, class) — duplicate schedules
    // (re-imports) re-publish the same id across runs, and QStash rejects the
    // duplicate, so one class occurrence always yields exactly one message.
    const msgSuffix = createHash("sha1").update(classKey).digest("hex").slice(0, 8);

    // "Upcoming class" push at exactly [start - minutesBefore].
    const preAt = occ - minutes;
    if (
      preAt > now.getTime() &&
      preAt <= now.getTime() + MAX_DELAY_MS &&
      !seenPre.has(key)
    ) {
      seenPre.add(key);
      tasks.push(async () => {
        try {
          await client.publishJSON({
            url: `${baseUrl}/api/reminders/fire`,
            method: "POST",
            body: { reminderId: reminder.id, occ, kind: "pre" },
            // The Upstash-Not-Before header expects unix SECONDS (not ms).
            notBefore: Math.floor(preAt / 1000),
            messageId: `rem-${reminder.userId}-${occ}-pre-${msgSuffix}`,
            retries: 1,
          });
          void incrementUsage(USAGE_SERVICES.QSTASH);
          return "scheduled";
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/duplicate|already exists|maxDelay/i.test(msg)) return "skipped";
          console.error("[QSTASH_SCHEDULE]", err);
          return "failed";
        }
      });
    }

    // "Class starting now" push at exactly [start].
    if (
      occ > now.getTime() &&
      occ <= now.getTime() + MAX_DELAY_MS &&
      !seenStart.has(key)
    ) {
      seenStart.add(key);
      tasks.push(async () => {
        try {
          await client.publishJSON({
            url: `${baseUrl}/api/reminders/fire`,
            method: "POST",
            body: { reminderId: reminder.id, occ, kind: "start" },
            notBefore: Math.floor(occ / 1000),
            messageId: `rem-${reminder.userId}-${occ}-start-${msgSuffix}`,
            retries: 1,
          });
          void incrementUsage(USAGE_SERVICES.QSTASH);
          return "scheduled";
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/duplicate|already exists|maxDelay/i.test(msg)) return "skipped";
          console.error("[QSTASH_SCHEDULE]", err);
          return "failed";
        }
      });
    }
  }

  // Run the publish pool with bounded concurrency, then tally the outcomes.
  const outcomes: PublishOutcome[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]!;
      outcomes.push(await task());
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker())
  );

  for (const outcome of outcomes) {
    if (outcome === "scheduled") scheduled++;
    else if (outcome === "skipped") skipped++;
  }

  return { scheduled, skipped, total: reminders.length };
}

function wallParts(d: Date): { h: number; m: number } {
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

function startLabel(startTime: Date): string {
  const { h, m } = wallParts(startTime);
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

async function deliverPushToUser(
  userId: string,
  title: string,
  body: string
): Promise<string[]> {
  const subs = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  const stale: string[] = [];
  if (subs.length > 0 && isVapidConfigured()) {
    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendPush(sub, { title, body, url: "/classes" });
        if (result.stale) stale.push(sub.endpoint);
      })
    );
    return stale;
  }
  if (isFcmConfigured()) {
    await sendFCMPush({ userId, title, body, url: "/classes" });
  }
  return stale;
}

/**
 * Fire one class reminder (idempotent). Used by the QStash webhook at the
 * scheduled exact time.
 *
 * `kind: "pre"`   → "Upcoming class" at [start - minutesBefore]
 * `kind: "start"` → "Class starting now" at [start]
 *
 * Duplicates (same class in several schedules, cron catch-up, QStash retries)
 * are deduped per (reminder, occurrence): `lastSentAt` guards the upcoming
 * push, `lastStartSentAt` guards the starting-now push.
 */
export async function sendClassReminderPush(args: {
  reminderId: string;
  occ: number;
  kind?: "pre" | "start";
}): Promise<{ sent: boolean; reason?: string }> {
  const { reminderId, occ, kind = "pre" } = args;
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
    include: {
      class: true,
      user: { select: { id: true, timezone: true } },
    },
  });
  if (!reminder || !reminder.isActive) return { sent: false, reason: "inactive" };

  const cls = reminder.class;
  const label = cls.shortName?.trim() || cls.code?.trim() || cls.subject;
  const startLabelTxt = startLabel(cls.startTime);

  if (kind === "start") {
    // Drop stale QStash messages: if the class time was edited after this
    // message was scheduled, the occurrence it claims no longer exists in the
    // live schedule — firing would remind the user at the wrong moment. The
    // daily cron catch-up re-delivers based on the current schedule instead.
    const tz = reminder.user.timezone || "Asia/Manila";
    const nowMs = Date.now();
    const liveOcc = lastOccurrence(
      cls.startTime,
      cls.days as DayOfWeek[],
      tz,
      new Date(nowMs + 5 * 60 * 1000)
    );
    if (
      liveOcc === null ||
      liveOcc !== occ ||
      nowMs < occ - 5 * 60 * 1000 ||
      nowMs > occ + 10 * 60 * 1000
    ) {
      return { sent: false, reason: "stale-occurrence" };
    }

    // "Class starting now" — atomic claim on the occurrence BEFORE delivering.
    // Duplicate schedules re-import the same class as separate Reminder rows,
    // each with its own QStash message; claim every matching row at once so
    // only the first delivery to reach the DB wins and the rest drop out.
    const claimed = await db.reminder.updateMany({
      where: {
        userId: reminder.userId,
        class: {
          startTime: cls.startTime,
          endTime: cls.endTime,
          subject: cls.subject,
          room: cls.room,
        },
        OR: [{ lastStartSentAt: null }, { lastStartSentAt: { lt: new Date(occ) } }],
      },
      data: { lastStartSentAt: new Date(occ) },
    });
    if (claimed.count === 0) {
      return { sent: false, reason: "already-sent" };
    }

    const title = "Class starting now";
    const body = `You have class today — ${label} at ${startLabelTxt}`;

    // Deduped across every duplicate class row: the notification row is the
    // lock — if another row already recorded this occurrence, stay silent so
    // the user is pushed once, not once per duplicate schedule.
    const { fresh } = await upsertClassReminderNotification(
      reminder.userId,
      title,
      `${label} starts now (${startLabelTxt})`,
      new Date(occ),
    );
    if (!fresh) return { sent: false, reason: "already-sent" };

    const stale = await deliverPushToUser(reminder.userId, title, body);

    if (stale.length > 0) {
      await db.pushSubscription.deleteMany({ where: { endpoint: { in: stale } } });
    }

    return { sent: true };
  }

  // "Upcoming class" at [start - minutesBefore]. The "start" QStash message
  // (and the cron catch-up) own the "Class starting now" push — if this pre
  // message was delivered after the class already started, skip it entirely
  // so it can never turn into a second "starting now".
  if (reminder.lastSentAt && reminder.lastSentAt.getTime() >= occ) {
    return { sent: false, reason: "already-sent" };
  }

  // Same staleness guard as "start": an old QStash message (class time edited
  // after scheduling) must not fire for an occurrence that no longer exists.
  const tz = reminder.user.timezone || "Asia/Manila";
  const liveNext = nextOccurrence(
    cls.startTime,
    cls.days as DayOfWeek[],
    tz,
    new Date()
  );
  if (liveNext === null || liveNext !== occ) {
    return { sent: false, reason: "stale-occurrence" };
  }

  const now = new Date();
  const remaining = Math.max(0, Math.round((occ - now.getTime()) / 60000));
  if (remaining <= 0) {
    return { sent: false, reason: "late-pre-skipped" };
  }

  // Atomic claim on the occurrence before delivering — concurrent deliveries
  // (duplicate schedules, QStash retries) can't both get through. Claims every
  // matching row for this class so duplicate schedules share one "upcoming"
  // push instead of N identical ones.
  const claimedPre = await db.reminder.updateMany({
    where: {
      userId: reminder.userId,
      class: {
        startTime: cls.startTime,
        endTime: cls.endTime,
        subject: cls.subject,
        room: cls.room,
      },
      OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(occ) } }],
    },
    data: { lastSentAt: new Date(occ) },
  });
  if (claimedPre.count === 0) {
    return { sent: false, reason: "already-sent" };
  }

  const title = "Upcoming class";
  const body =
    remaining > 180
      ? `${label} at ${startLabelTxt}`
      : `${label} starts in ${remaining} min (${startLabelTxt})`;

  // Deduped across every duplicate class row — same lock as the start push.
  const { fresh } = await upsertClassReminderNotification(
    reminder.userId,
    title,
    `Reminder: ${label} at ${startLabelTxt}.`,
    new Date(occ),
  );
  if (!fresh) return { sent: false, reason: "already-sent" };

  const stale = await deliverPushToUser(reminder.userId, title, body);

  if (stale.length > 0) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: stale } } });
  }

  return { sent: true };
}
