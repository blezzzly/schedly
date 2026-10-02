import { describe, it, expect } from "vitest";
import { validateExtractedClasses } from "@/server/services/validation.service";

describe("validateExtractedClasses — enhanced duplicate & conflict detection", () => {
  it("flags exact duplicates (same subject + code + days)", () => {
    const result = validateExtractedClasses([
      { subject: "Calculus", code: "MATH 201", days: ["monday", "wednesday"], startTime: "09:00", endTime: "10:30" },
      { subject: "Calculus", code: "MATH 201", days: ["monday", "wednesday"], startTime: "09:00", endTime: "10:30" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(true);
  });

  it("flags duplicate by same subject + same time even when code is missing", () => {
    const result = validateExtractedClasses([
      { subject: "Physics", days: ["tuesday"], startTime: "13:00", endTime: "14:30" },
      { subject: "Physics", days: ["tuesday"], startTime: "13:00", endTime: "14:30" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(true);
  });

  it("does NOT flag different subjects sharing a time slot", () => {
    const result = validateExtractedClasses([
      { subject: "Calculus", days: ["tuesday"], startTime: "13:00", endTime: "14:30" },
      { subject: "English", days: ["tuesday"], startTime: "13:00", endTime: "14:30" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(false);
  });

  it("ignores whitespace/case when comparing subject names", () => {
    const result = validateExtractedClasses([
      { subject: "  History ", days: ["friday"], startTime: "10:00", endTime: "11:00" },
      { subject: "history", days: ["friday"], startTime: "10:00", endTime: "11:00" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(true);
  });

  it("still flags real overlaps on shared days", () => {
    const result = validateExtractedClasses([
      { subject: "Calculus", days: ["monday"], startTime: "09:00", endTime: "10:30" },
      { subject: "PE", days: ["monday"], startTime: "10:00", endTime: "11:30" },
    ]);
    expect(result.issues.some((i) => i.type === "overlap")).toBe(true);
  });

  it("does not flag overlap when classes are on different days", () => {
    const result = validateExtractedClasses([
      { subject: "Calculus", days: ["monday"], startTime: "09:00", endTime: "10:30" },
      { subject: "PE", days: ["tuesday"], startTime: "10:00", endTime: "11:30" },
    ]);
    expect(result.issues.some((i) => i.type === "overlap")).toBe(false);
  });

  it("does NOT flag same subject + code + days with DIFFERENT (non-overlapping) times", () => {
    const result = validateExtractedClasses([
      { subject: "OLCC03", code: "OLCC03", days: ["tuesday", "friday"], startTime: "12:00", endTime: "13:30" },
      { subject: "OLCC03", code: "OLCC03", days: ["tuesday", "friday"], startTime: "16:30", endTime: "18:00" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(false);
    expect(result.issues.some((i) => i.type === "overlap")).toBe(false);
  });

  it("does NOT flag same subject on different days at different times", () => {
    const result = validateExtractedClasses([
      { subject: "OLCC03", code: "OLCC03", days: ["tuesday"], startTime: "12:00", endTime: "13:30" },
      { subject: "OLCC03", code: "OLCC03", days: ["friday"], startTime: "16:30", endTime: "18:00" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(false);
    expect(result.issues.some((i) => i.type === "overlap")).toBe(false);
  });

  it("still flags same subject at the SAME time on a shared day", () => {
    const result = validateExtractedClasses([
      { subject: "OLCC03", code: "OLCC03", days: ["tuesday"], startTime: "12:00", endTime: "13:30" },
      { subject: "OLCC03", code: "OLCC03", days: ["tuesday", "friday"], startTime: "12:00", endTime: "13:30" },
    ]);
    expect(result.issues.some((i) => i.type === "duplicate")).toBe(true);
  });
});
