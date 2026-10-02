"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { reminderService } from "@/server/services/reminder.service";
import { auditLog } from "@/server/lib/audit";
import { scheduleQstashReminders } from "@/server/services/qstash-reminder.service";
import { dispatchDueReminders } from "@/server/services/reminder-dispatcher.service";
import { dispatchTodoDeadlines } from "@/server/services/todo-deadline-reminder.service";

export async function getUserReminders() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  try {
    return await reminderService.getByUser(session.user.id);
  } catch {
    return [];
  }
}

/** Re-schedule exact-time QStash reminders for the signed-in user. Called
 *  after reminder edits and from the app shell (throttled client-side). */
export async function scheduleUpcomingReminders() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false };
  try {
    const result = await scheduleQstashReminders(new Date(), session.user.id);
    return { ok: true, ...result };
  } catch (err) {
    console.error("[SCHEDULE_UPCOMING]", err);
    return { ok: false };
  }
}

/** Client heartbeat — dispatches due reminders for the signed-in user NOW.
 *  QStash isn't configured in this deployment, so exact-time reminders only
 *  fire when something checks for them: this runs while the app is open (the
 *  daily cron remains the safety net for when it's closed). Delivery is
 *  deduped via lastSentAt/lastStartSentAt, so polling every minute is safe. */
export async function dispatchUserReminders() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false };
  try {
    const result = await dispatchDueReminders(new Date(), session.user.id);
    const todos = await dispatchTodoDeadlines(new Date(), session.user.id);
    return { ok: true, ...result, todos };
  } catch (err) {
    console.error("[DISPATCH_USER]", err);
    return { ok: false };
  }
}

export type UpdateReminderResult =
  | { success: true }
  | { success: false; error: string };

export async function updateReminder(
  reminderId: string,
  data: { minutesBefore?: number; isActive?: boolean }
): Promise<UpdateReminderResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const minutes = data.minutesBefore;
  if (minutes != null && (minutes < 0 || minutes > 1440 || !Number.isInteger(minutes))) {
    return { success: false, error: "Invalid minutes" };
  }

  const reminder = await reminderService.getById(reminderId);
  if (!reminder || reminder.userId !== session.user.id) {
    return { success: false, error: "Reminder not found" };
  }

  try {
    await reminderService.update(reminderId, {
      minutesBefore: minutes ?? undefined,
      isActive: data.isActive ?? undefined,
    });
    auditLog("reminders.update", { reminderId, minutesBefore: minutes, isActive: data.isActive });
    // Re-schedule exact-time pushes so edits take effect for the next occurrence.
    await scheduleQstashReminders(new Date(), session.user.id).catch(() => {});
    return { success: true };
  } catch (err) {
    console.error("[UPDATE_REMINDER]", err);
    return { success: false, error: "Failed to update reminder" };
  }
}