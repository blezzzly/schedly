import { describe, it, expect } from "vitest";
import { checkScheduleConsistency, detectConflicts, validateSchedule } from "@/server/lib/ai";

describe("checkScheduleConsistency", () => {
  it("returns no issues for valid data", () => {
    const result = checkScheduleConsistency({
      classes: [
        { subject: "Math", days: ["monday"], startTime: "08:00", endTime: "09:30" },
      ],
    });
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(1);
  });

  it("flags missing subject", () => {
    const result = checkScheduleConsistency({
      classes: [{ subject: "", days: ["monday"], startTime: "08:00", endTime: "09:30" }],
    });
    expect(result.issues.some((i) => i.field === "subject")).toBe(true);
  });

  it("flags missing time", () => {
    const result = checkScheduleConsistency({
      classes: [{ subject: "Math", days: ["monday"], startTime: "", endTime: "" }],
    });
    expect(result.issues.some((i) => i.field === "startTime")).toBe(true);
    expect(result.issues.some((i) => i.field === "endTime")).toBe(true);
  });

  it("flags invalid time format", () => {
    const result = checkScheduleConsistency({
      classes: [{ subject: "Math", days: ["monday"], startTime: "8am", endTime: "9am" }],
    });
    expect(result.issues.some((i) => i.field === "startTime" && i.type === "invalid_time")).toBe(true);
  });

  it("flags endTime <= startTime", () => {
    const result = checkScheduleConsistency({
      classes: [{ subject: "Math", days: ["monday"], startTime: "10:00", endTime: "09:00" }],
    });
    expect(result.issues.some((i) => i.type === "impossible_value")).toBe(true);
  });

  it("flags invalid day", () => {
    const result = checkScheduleConsistency({
      classes: [{ subject: "Math", days: ["funday"], startTime: "08:00", endTime: "09:30" }],
    });
    expect(result.issues.some((i) => i.type === "invalid_day")).toBe(true);
  });

  it("flags missing days", () => {
    const result = checkScheduleConsistency({
      classes: [{ subject: "Math", days: [], startTime: "08:00", endTime: "09:30" }],
    });
    expect(result.issues.some((i) => i.field === "days")).toBe(true);
  });
});

describe("detectConflicts", () => {
  it("detects overlapping classes on the same day", () => {
    const conflicts = detectConflicts({
      classes: [
        { subject: "Math", days: ["monday"], startTime: "08:00", endTime: "10:00" },
        { subject: "Physics", days: ["monday"], startTime: "09:00", endTime: "10:30" },
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.classA).toBe(0);
    expect(conflicts[0]?.classB).toBe(1);
  });

  it("returns no conflict for different days", () => {
    const conflicts = detectConflicts({
      classes: [
        { subject: "Math", days: ["monday"], startTime: "08:00", endTime: "10:00" },
        { subject: "Physics", days: ["tuesday"], startTime: "08:00", endTime: "10:00" },
      ],
    });
    expect(conflicts).toHaveLength(0);
  });

  it("returns no conflict for back-to-back classes", () => {
    const conflicts = detectConflicts({
      classes: [
        { subject: "Math", days: ["monday"], startTime: "08:00", endTime: "10:00" },
        { subject: "Physics", days: ["monday"], startTime: "10:00", endTime: "11:30" },
      ],
    });
    expect(conflicts).toHaveLength(0);
  });
});

describe("validateSchedule", () => {
  it("returns combined result", () => {
    const result = validateSchedule({
      classes: [
        { subject: "Math", days: ["monday"], startTime: "08:00", endTime: "10:00" },
        { subject: "Physics", days: ["monday"], startTime: "09:00", endTime: "10:30" },
      ],
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.consistency.score).toBeGreaterThan(0);
  });

  it("returns clean result for valid data", () => {
    const result = validateSchedule({
      classes: [
        { subject: "Math", days: ["monday"], startTime: "08:00", endTime: "10:00" },
        { subject: "Physics", days: ["tuesday"], startTime: "08:00", endTime: "10:00" },
      ],
    });
    expect(result.hasConflicts).toBe(false);
    expect(result.hasConsistencyIssues).toBe(false);
  });
});
