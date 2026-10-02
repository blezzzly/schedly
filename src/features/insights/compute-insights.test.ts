import { describe, it, expect } from "vitest";
import {
  computeScheduleInsights,
  getFreeTimeToday,
  minutesToHoursLabel,
  formatClock,
  DAY_ORDER,
  type InsightItem,
} from "@/features/insights/compute-insights";

const item = (
  subject: string,
  days: string[],
  start: string,
  end: string
): InsightItem => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return {
    subject,
    days,
    startMinutes: sh! * 60 + sm!,
    endMinutes: eh! * 60 + em!,
  };
};

describe("computeScheduleInsights", () => {
  it("handles empty input", () => {
    const r = computeScheduleInsights([]);
    expect(r.totalWeeklyMinutes).toBe(0);
    expect(r.activeDayCount).toBe(0);
    expect(r.fullyFreeDays).toHaveLength(7);
    expect(r.busiestDay).toBeNull();
  });

  it("computes total weekly hours and busiest/lightest day", () => {
    const r = computeScheduleInsights([
      item("Math", ["monday"], "09:00", "11:00"), // 120m Mon
      item("PE", ["friday"], "14:00", "17:00"), // 180m Fri
    ]);
    expect(r.totalWeeklyMinutes).toBe(300);
    expect(r.totalWeeklyHours).toBe(5);
    expect(r.activeDayCount).toBe(2);
    expect(r.busiestDay).toEqual({ day: "friday", busyMinutes: 180 });
    expect(r.lightestDay).toEqual({ day: "monday", busyMinutes: 120 });
  });

  it("does not double-count overlapping classes on the same day", () => {
    const r = computeScheduleInsights([
      item("Math", ["monday"], "09:00", "11:00"),
      item("Physics", ["monday"], "10:00", "12:00"), // overlaps 10-11
    ]);
    expect(r.perDay["monday"]!.busyMinutes).toBe(180); // 09:00-12:00, not 240
  });

  it("detects the longest event", () => {
    const r = computeScheduleInsights([
      item("Math", ["monday"], "09:00", "11:00"),
      item("Lab", ["tuesday"], "13:00", "18:00"), // 300m
    ]);
    expect(r.longestEvent).toEqual({ subject: "Lab", durationMinutes: 300 });
  });

  it("computes free hours and utilization", () => {
    // Window is 07:00-22:00 = 900min/day = 6300min/week.
    const r = computeScheduleInsights([item("Math", ["monday"], "09:00", "11:00")]);
    expect(r.freeHours).toBe(Math.round((6300 - 120) / 60));
    expect(r.weeklyUtilizationPct).toBe(Math.round((120 / 6300) * 100));
  });

  it("finds recurring free periods on multiple days", () => {
    const r = computeScheduleInsights([
      item("Math", ["monday", "wednesday", "friday"], "09:00", "11:00"),
      item("PE", ["monday", "wednesday", "friday"], "14:00", "16:00"),
    ]);
    // Every one of those days has a 3h gap 11:00-14:00.
    const gap = r.recurringFree.find((g) => g.startMinutes === 11 * 60 && g.endMinutes === 14 * 60);
    expect(gap).toBeDefined();
    expect(gap!.days).toHaveLength(3);
  });

  it("marks fully free days", () => {
    const r = computeScheduleInsights([
      item("Math", ["monday"], "09:00", "11:00"),
      item("PE", ["tuesday"], "09:00", "11:00"),
    ]);
    expect(r.fullyFreeDays).toContain("sunday");
    expect(r.fullyFreeDays).not.toContain("monday");
  });

  it("orders DAY_ORDER monday-first", () => {
    expect(DAY_ORDER[0]).toBe("monday");
    expect(DAY_ORDER[6]).toBe("sunday");
  });
});

describe("getFreeTimeToday", () => {
  it("returns today's free periods and total", () => {
    const t = getFreeTimeToday(
      [item("Math", ["tuesday"], "09:00", "11:00"), item("PE", ["tuesday"], "14:00", "16:00")],
      "tuesday"
    );
    expect(t.isFullyFree).toBe(false);
    expect(t.totalFreeMinutes).toBe(900 - 120 - 120); // full window minus busy
    expect(t.freePeriods.some((p) => p.startMinutes === 11 * 60 && p.endMinutes === 14 * 60)).toBe(true);
  });

  it("reports fully free days", () => {
    const t = getFreeTimeToday([item("Math", ["monday"], "09:00", "11:00")], "sunday");
    expect(t.isFullyFree).toBe(true);
    expect(t.totalFreeMinutes).toBe(900);
  });
});

describe("formatters", () => {
  it("formats minutes to a readable duration", () => {
    expect(minutesToHoursLabel(90)).toBe("1h 30m");
    expect(minutesToHoursLabel(120)).toBe("2h");
    expect(minutesToHoursLabel(45)).toBe("45m");
    expect(minutesToHoursLabel(0)).toBe("0m");
  });

  it("formats clock with 12h am/pm", () => {
    expect(formatClock(9 * 60)).toBe("9:00 AM");
    expect(formatClock(14 * 60 + 30)).toBe("2:30 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12 * 60)).toBe("12:00 PM");
  });
});
