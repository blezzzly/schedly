"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { scheduleService, DEFAULT_COLORS } from "@/server/services/schedule.service";
import { notificationService } from "@/server/services/notification.service";
import { saveScheduleSchema } from "@/server/validators/ai.schema";
import { db } from "@/server/db/client";
import { scheduleQstashReminders } from "@/server/services/qstash-reminder.service";
import { auditLog } from "@/server/lib/audit";
import { generateShortName } from "@/lib/abbreviations";
import { toShareable } from "@/lib/schedule-share";
import {
  createShareCode,
  peekShareCode,
  consumeShareCode,
  isValidCodeShape,
  lookupRateLimitKey,
  LOOKUP_LIMIT,
  LOOKUP_WINDOW_MS,
} from "@/server/lib/schedule-share-store";
import { peekRateLimitDb, checkRateLimitDb } from "@/server/lib/security";
import type { DayOfWeek } from "@/generated/prisma/client";

export type SaveScheduleResult =
  | { success: true; scheduleId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveSchedule(data: unknown): Promise<SaveScheduleResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const parsed = saveScheduleSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    parsed.error.issues.forEach((issue) => {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    });
    return { success: false, error: "Validation failed", fieldErrors };
  }

  try {
    const schedule = await scheduleService.create(session.user.id, parsed.data);
    auditLog("schedule.create", { userId: session.user.id, scheduleId: schedule.id, title: parsed.data.title });
    const classCount = parsed.data.classes.length;
    await notificationService.create(session.user.id, {
      type: "schedule_update",
      title: "Schedule Uploaded",
      body: `${parsed.data.title} is ready — ${classCount} class${classCount !== 1 ? "es" : ""} added.`,
    });
    return { success: true, scheduleId: schedule.id };
  } catch (err) {
    console.error("[SAVE_SCHEDULE]", err);
    return { success: false, error: "Failed to save schedule. Please try again." };
  }
}

export async function deleteSchedule(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const result = await scheduleService.delete(scheduleId, session.user.id);
    if (!result) return { success: false, error: "Schedule not found" };
    auditLog("schedule.delete", { userId: session.user.id, scheduleId });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_SCHEDULE]", err);
    return { success: false, error: "Failed to delete schedule" };
  }
}

export async function getSchedule(scheduleId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  try {
    const schedule = await scheduleService.getByUser(session.user.id);
    return schedule.find((s) => s.id === scheduleId) ?? null;
  } catch {
    return null;
  }
}

export async function getUserSchedules() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  try {
    return await scheduleService.getByUser(session.user.id);
  } catch {
    return [];
  }
}

/**
 * Mint a six-digit share code for one of the caller's schedules.
 *
 * Ownership is checked here rather than trusting the id, so nobody can mint a
 * code for another account's timetable. Only one live code per schedule at a
 * time — re-sharing replaces the old one, so a code a classmate already has
 * can't be silently invalidated and a stale code can't linger past its own use.
 */
export async function createScheduleShareCode(
  scheduleId: string
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Unauthorized" };

  try {
    const schedule = await db.schedule.findFirst({
      where: { id: scheduleId, userId: session.user.id },
      select: {
        title: true,
        semester: true,
        academicYear: true,
        classes: {
          select: {
            subject: true,
            shortName: true,
            code: true,
            instructor: true,
            room: true,
            section: true,
            block: true,
            notes: true,
            days: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!schedule) return { ok: false, error: "Schedule not found" };
    if (schedule.classes.length === 0) {
      return { ok: false, error: "That schedule has no classes to share." };
    }

    await db.scheduleShare.deleteMany({ where: { scheduleId, userId: session.user.id } });

    const result = await createShareCode(session.user.id, scheduleId, toShareable(schedule as never));
    if (!result.ok) return result;

    return { ok: true, code: result.code, expiresAt: result.expiresAt.toISOString() };
  } catch (err) {
    console.error("[CREATE_SHARE_CODE]", err);
    return { ok: false, error: "Couldn't create a share code. Please try again." };
  }
}

/**
 * Import a schedule from a six-digit share code.
 *
 * Peek first, commit second: the rate limit is charged only for attempts that
 * got past the shape check, and the code is marked spent only once the schedule
 * actually exists — so a failed import doesn't burn the classmate's code.
 *
 * The decoded payload is then re-validated with `saveScheduleSchema` before it
 * reaches `scheduleService.create`, exactly like an AI extraction result. A
 * guessed code is indistinguishable from a real one, so this path treats it as
 * untrusted input regardless of where it came from.
 */
export async function importScheduleFromCode(
  rawCode: string
): Promise<{ ok: true; scheduleId: string; classCount: number } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Unauthorized" };

  if (!isValidCodeShape(rawCode)) {
    return { ok: false, error: "A share code is 6 digits." };
  }

  const { allowed } = await peekRateLimitDb(
    lookupRateLimitKey(session.user.id),
    LOOKUP_LIMIT,
    LOOKUP_WINDOW_MS,
  );
  if (!allowed) {
    return {
      ok: false,
      error: `Too many attempts. Try again in about ${Math.max(1, Math.ceil(LOOKUP_WINDOW_MS / 60000))} minutes.`,
    };
  }

  const lookup = await peekShareCode(rawCode);
  if (!lookup.ok) return { ok: false, error: lookup.error };

  // Charge the lookup now that we know it got past the shape check.
  await checkRateLimitDb(lookupRateLimitKey(session.user.id), LOOKUP_LIMIT, LOOKUP_WINDOW_MS);

  const parsed = saveScheduleSchema.safeParse({
    title: lookup.schedule.title,
    semester: lookup.schedule.semester,
    academicYear: lookup.schedule.academicYear,
    classes: lookup.schedule.classes,
  });
  if (!parsed.success) {
    console.error("[IMPORT_SCHEDULE_CODE] validation failed", parsed.error.issues);
    return { ok: false, error: "That code contains data this app can't read." };
  }

  try {
    const schedule = await scheduleService.create(session.user.id, parsed.data);
    const classCount = parsed.data.classes.length;
    await consumeShareCode(rawCode);
    auditLog("schedule.import_code", {
      userId: session.user.id,
      scheduleId: schedule.id,
      classCount,
    });
    await notificationService.create(session.user.id, {
      type: "schedule_update",
      title: "Schedule Imported",
      body: `${parsed.data.title} was added — ${classCount} class${classCount !== 1 ? "es" : ""} imported.`,
    });
    return { ok: true, scheduleId: schedule.id, classCount };
  } catch (err) {
    console.error("[IMPORT_SCHEDULE_CODE]", err);
    return { ok: false, error: "Couldn't import that schedule. Please try again." };
  }
}

export type ClassEditInput = {
  /** Existing class id, or a "new-*" id to create a fresh class. */
  id: string;
  subject: string;
  shortName?: string | null;
  code?: string | null;
  /** "HH:MM" wall-clock start/end — optional for edits, required for new classes. */
  startTime?: string | null;
  endTime?: string | null;
  /** Days the class occurs on — optional for edits, required for new classes. */
  days?: DayOfWeek[];
};

const VALID_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function parseHHMM(s: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** Class times are stored with UTC components carrying the local wall clock
 *  (see parseTime in schedule.service). Keep the original date and only swap
 *  the wall-clock hours/minutes. */
function applyWallClock(base: Date, t: { h: number; m: number }): Date {
  const d = new Date(base);
  d.setUTCHours(t.h, t.m, 0, 0);
  return d;
}

export async function updateClasses(
  scheduleId: string,
  updates: ClassEditInput[]
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    select: { userId: true },
  });
  if (!schedule || schedule.userId !== session.user.id) {
    return { success: false, error: "Schedule not found" };
  }

  const userSettings = await db.user.findUnique({
    where: { id: session.user.id },
    select: { defaultReminderMinutes: true },
  });
  const defaultMinutes = userSettings?.defaultReminderMinutes ?? 15;

  try {
    const isNew = (id: string) => id.startsWith("new-");
    let classCount = await db.class.count({ where: { scheduleId } });

    for (const u of updates) {
      const subject = u.subject?.trim();
      if (!subject) return { success: false, error: "Subject name is required" };

      const start = u.startTime != null && u.startTime !== "" ? parseHHMM(u.startTime) : null;
      const end = u.endTime != null && u.endTime !== "" ? parseHHMM(u.endTime) : null;
      if (u.startTime != null && u.startTime !== "" && !start) {
        return { success: false, error: "Invalid start time" };
      }
      if (u.endTime != null && u.endTime !== "" && !end) {
        return { success: false, error: "Invalid end time" };
      }
      if (start && end && end.h * 60 + end.m <= start.h * 60 + start.m) {
        return { success: false, error: "End time must be after start time" };
      }
      if (
        u.days !== undefined &&
        (u.days.length === 0 ||
          u.days.some((d) => !VALID_DAYS.includes(d as (typeof VALID_DAYS)[number])))
      ) {
        return { success: false, error: "Select at least one valid class day" };
      }

      if (isNew(u.id)) {
        // New subject — time and days are required.
        if (!start || !end) {
          return { success: false, error: "Start and end times are required for new subjects" };
        }
        if (!u.days || u.days.length === 0) {
          return { success: false, error: "Select at least one class day" };
        }
        const created = await db.class.create({
          data: {
            scheduleId,
            subject,
            shortName: u.shortName?.trim() || generateShortName(subject),
            code: u.code?.trim() || null,
            color: DEFAULT_COLORS[classCount % DEFAULT_COLORS.length]!,
            startTime: applyWallClock(new Date(), start),
            endTime: applyWallClock(new Date(), end),
            days: u.days as DayOfWeek[],
          },
        });
        classCount += 1;
        await db.reminder.create({ data: { classId: created.id, userId: session.user.id, minutesBefore: defaultMinutes } });
        continue;
      }

      const row = await db.class.findUnique({
        where: { id: u.id },
        select: { scheduleId: true, startTime: true, endTime: true },
      });
      if (!row || row.scheduleId !== scheduleId) {
        return { success: false, error: "Class not found" };
      }

      await db.class.update({
        where: { id: u.id },
        data: {
          subject,
          shortName: u.shortName?.trim() || null,
          code: u.code?.trim() || null,
          ...(start ? { startTime: applyWallClock(row.startTime, start) } : {}),
          ...(end ? { endTime: applyWallClock(row.endTime, end) } : {}),
          ...(u.days !== undefined ? { days: u.days as DayOfWeek[] } : {}),
        },
      });
    }

    auditLog("schedule.edit", { userId: session.user.id, scheduleId, classCount: updates.length });

    // Times may have changed — re-arm the exact-time QStash reminders with the
    // new occurrences. Old messages for stale times are ignored at fire time
    // by the staleness guard in sendClassReminderPush.
    await scheduleQstashReminders(new Date(), session.user.id);

    return { success: true };
  } catch (err) {
    console.error("[UPDATE_CLASSES]", err);
    return { success: false, error: "Failed to save changes. Please try again." };
  }
}
