export type InsightItem = {
  subject: string;
  days: string[];
  startMinutes: number;
  endMinutes: number;
};

export type FreePeriod = {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
};

export type DayInsight = {
  day: string;
  busyMinutes: number;
  freePeriods: FreePeriod[];
};

export type ScheduleInsights = {
  totalWeeklyMinutes: number;
  totalWeeklyHours: number;
  freeHours: number;
  busiestDay: { day: string; busyMinutes: number } | null;
  lightestDay: { day: string; busyMinutes: number } | null;
  longestEvent: { subject: string; durationMinutes: number } | null;
  averageDailyMinutes: number;
  weeklyUtilizationPct: number;
  activeDayCount: number;
  fullyFreeDays: string[];
  recurringFree: { startMinutes: number; endMinutes: number; days: string[] }[];
  perDay: Record<string, DayInsight>;
};

export const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const DAY_FULL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const DAY_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

// The day window used to reason about "free" vs "away" time.
// Events outside this window still count as busy, but the window
// defines what we consider available time.
export const ACTIVE_WINDOW = { start: 7 * 60, end: 22 * 60 };

export function minutesToHoursLabel(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function computeDayBusyMinutes(items: InsightItem[], day: string): number {
  let busy = 0;
  const used: { start: number; end: number }[] = [];
  for (const item of items) {
    if (!item.days.includes(day)) continue;
    const start = item.startMinutes;
    const end = item.endMinutes;
    if (end <= start) continue;
    // Merge overlapping intervals so double-booked classes aren't double-counted.
    const overlapIdx = used.findIndex((u) => start < u.end && end > u.start);
    if (overlapIdx >= 0) {
      used[overlapIdx]!.start = Math.min(start, used[overlapIdx]!.start);
      used[overlapIdx]!.end = Math.max(end, used[overlapIdx]!.end);
    } else {
      used.push({ start, end });
    }
  }
  for (const u of used) busy += u.end - u.start;
  return busy;
}

function computeFreePeriods(items: InsightItem[], day: string): FreePeriod[] {
  const { start: wStart, end: wEnd } = ACTIVE_WINDOW;
  const blocks = items
    .filter((it) => it.days.includes(day) && it.endMinutes > it.startMinutes)
    .map((it) => ({
      start: Math.max(it.startMinutes, wStart),
      end: Math.min(it.endMinutes, wEnd),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const free: FreePeriod[] = [];
  let cursor = wStart;
  for (const block of blocks) {
    if (block.start > cursor) {
      free.push({
        startMinutes: cursor,
        endMinutes: block.start,
        durationMinutes: block.start - cursor,
      });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < wEnd) {
    free.push({ startMinutes: cursor, endMinutes: wEnd, durationMinutes: wEnd - cursor });
  }
  return free.filter((f) => f.durationMinutes > 0);
}

export function computeScheduleInsights(items: InsightItem[]): ScheduleInsights {
  const perDay: Record<string, DayInsight> = {};
  for (const day of DAY_ORDER) {
    perDay[day] = {
      day,
      busyMinutes: computeDayBusyMinutes(items, day),
      freePeriods: computeFreePeriods(items, day),
    };
  }

  const totalWeeklyMinutes = DAY_ORDER.reduce((sum, d) => sum + perDay[d]!.busyMinutes, 0);
  const activeDays = DAY_ORDER.filter((d) => perDay[d]!.busyMinutes > 0);
  const fullyFreeDays = DAY_ORDER.filter((d) => perDay[d]!.busyMinutes === 0);

  const windowMinutes = ACTIVE_WINDOW.end - ACTIVE_WINDOW.start;
  const freeMinutes = Math.max(0, windowMinutes * 7 - totalWeeklyMinutes);

  let busiestDay: { day: string; busyMinutes: number } | null = null;
  let lightestDay: { day: string; busyMinutes: number } | null = null;
  if (activeDays.length > 0) {
    busiestDay = {
      day: activeDays[0]!,
      busyMinutes: perDay[activeDays[0]!]!.busyMinutes,
    };
    for (const d of activeDays) {
      if (perDay[d]!.busyMinutes > busiestDay.busyMinutes) {
        busiestDay = { day: d, busyMinutes: perDay[d]!.busyMinutes };
      }
    }
    lightestDay = {
      day: activeDays[0]!,
      busyMinutes: perDay[activeDays[0]!]!.busyMinutes,
    };
    for (const d of activeDays) {
      if (perDay[d]!.busyMinutes < lightestDay.busyMinutes) {
        lightestDay = { day: d, busyMinutes: perDay[d]!.busyMinutes };
      }
    }
  }

  let longestEvent: { subject: string; durationMinutes: number } | null = null;
  for (const item of items) {
    const duration = item.endMinutes - item.startMinutes;
    if (duration > 0 && (longestEvent === null || duration > longestEvent.durationMinutes)) {
      longestEvent = { subject: item.subject, durationMinutes: duration };
    }
  }

  // Recurring free periods: identical gaps appearing on 2+ days.
  const byKey = new Map<string, { startMinutes: number; endMinutes: number; days: string[] }>();
  for (const day of DAY_ORDER) {
    for (const period of perDay[day]!.freePeriods) {
      const key = `${period.startMinutes}-${period.endMinutes}`;
      const entry = byKey.get(key);
      if (entry) {
        entry.days.push(day);
      } else {
        byKey.set(key, { startMinutes: period.startMinutes, endMinutes: period.endMinutes, days: [day] });
      }
    }
  }
  const recurringFree = [...byKey.values()]
    .filter((e) => e.days.length >= 2)
    .sort((a, b) => b.days.length - a.days.length);

  return {
    totalWeeklyMinutes,
    totalWeeklyHours: Math.round(totalWeeklyMinutes / 60),
    freeHours: Math.round(freeMinutes / 60),
    busiestDay,
    lightestDay,
    longestEvent,
    averageDailyMinutes: Math.round(totalWeeklyMinutes / 7),
    weeklyUtilizationPct:
      windowMinutes > 0 ? Math.min(100, Math.round((totalWeeklyMinutes / (windowMinutes * 7)) * 100)) : 0,
    activeDayCount: activeDays.length,
    fullyFreeDays,
    recurringFree,
    perDay,
  };
}

/** Free-time summary for a single day (used by the dashboard's "today" cards). */
export function getFreeTimeToday(items: InsightItem[], today: string): {
  freePeriods: FreePeriod[];
  totalFreeMinutes: number;
  isFullyFree: boolean;
} {
  const periods = computeFreePeriods(items, today);
  return {
    freePeriods: periods,
    totalFreeMinutes: periods.reduce((s, p) => s + p.durationMinutes, 0),
    isFullyFree: !items.some((it) => it.days.includes(today)),
  };
}
