"use client";

/* Client-side reminder alarms are retired: the server (QStash exact-time
 * pushes + the daily cron) now delivers BOTH the "-X min" upcoming reminder
 * and the "Class starting now" reminder. Local Notification-Trigger alarms
 * were unreliable (Android WebView / closed browsers never fired them) and
 * would double-deliver on browsers that do support them — so the app only
 * programs an empty alarm list to cancel whatever the service worker had
 * armed before this change.
 */

export interface Alarm {
  id: string;
  fireAt: number;
  title: string;
  body: string;
  url?: string;
}

type DayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

interface AlarmClass {
  id: string;
  days: DayKey[];
  startTime: Date | string;
  shortName?: string | null;
  code?: string | null;
  subject?: string | null;
  room?: string | null;
}
interface AlarmSchedule {
  classes: AlarmClass[];
}
interface AlarmReminder {
  id: string;
  classId: string;
  minutesBefore: number;
  isActive: boolean;
}

/** No local alarms — the server owns class reminders now. */
export function computeAlarms(
  schedules: AlarmSchedule[],
  reminders: AlarmReminder[]
): Alarm[] {
  void schedules;
  void reminders;
  return [];
}

/** Program local alarm reminders into the service worker. */
export async function programReminderAlarms(
  schedules: AlarmSchedule[],
  reminders: AlarmReminder[],
  suppress = false
): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (suppress) {
    await postAlarms([]);
    return;
  }

  const alarms = computeAlarms(schedules, reminders);
  await postAlarms(alarms);
}

async function postAlarms(alarms: Alarm[]): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "PROGRAM_ALARMS", alarms });
  } catch {
    // SW not ready — alarms will re-arm on its own activation.
  }
}