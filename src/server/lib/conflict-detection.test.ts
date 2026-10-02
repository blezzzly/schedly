import { describe, it, expect } from "vitest";
import { normalizeDays } from "@/server/lib/day-normalizer";
import { detectConflicts, checkScheduleConsistency } from "@/server/lib/ai";

/**
 * Regression tests for the reported bug:
 *   - "TF" must expand to Tue + Fri (never Tue + Thu)
 *   - A class on Tue/Fri and a class on Thu must NOT be flagged as overlapping
 *   - Day normalization must happen before conflict detection
 */

describe("conflict detection — TF expansion regression", () => {
  it("TF → Tuesday + Friday (deterministic), not Thursday", () => {
    expect(normalizeDays(["TF"]).days).toEqual(["tuesday", "friday"]);
  });

  it("no false overlap between Tue/Fri class and Thu class", () => {
    const classes = [
      { subject: "Understanding the Self", days: normalizeDays(["TF"]).days, startTime: "14:30", endTime: "16:00" },
      { subject: "Values Education", days: normalizeDays(["TH"]).days, startTime: "13:00", endTime: "16:00" },
    ];
    const conflicts = detectConflicts({ classes });
    expect(conflicts).toHaveLength(0);
  });

  it("still detects a REAL overlap on a shared day", () => {
    const classes = [
      { subject: "Understanding the Self", days: normalizeDays(["TF"]).days, startTime: "14:30", endTime: "16:00" },
      { subject: "PE", days: normalizeDays(["F"]).days, startTime: "15:00", endTime: "17:00" },
    ];
    const conflicts = detectConflicts({ classes });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.day).toBe("friday");
  });

  it("consistency check accepts normalized Tue/Fri + Thu schedule", () => {
    const classes = [
      { subject: "Understanding the Self", days: normalizeDays(["TF"]).days, startTime: "14:30", endTime: "16:00" },
      { subject: "Values Education", days: normalizeDays(["TH"]).days, startTime: "13:00", endTime: "16:00" },
    ];
    const { issues } = checkScheduleConsistency({ classes });
    expect(issues).toHaveLength(0);
  });
});
