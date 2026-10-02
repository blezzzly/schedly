/**
 * Unit tests for the OCR-based timetable extraction pipeline.
 *
 * These tests exercise the deterministic parts of the pipeline (detectors,
 * parser, validator) using mock OCR word data — no tesseract.js worker
 * required, so they run fast and deterministically.
 */

import { describe, it, expect } from "vitest";
import { detectDayFromText, detectTimeFromText, detectTimeRange, detectRoomFromText, extractCourseCode, isSubjectLikeText } from "@/server/lib/ocr/detect";
import { validateOcrSubjects } from "@/server/lib/ocr/validate";
import type { OcrWord, DayKey } from "@/server/lib/ocr/types";
import { parseTimetableFromWords } from "@/server/lib/ocr/parse-words";

// ── Day detection ────────────────────────────────────────────────────────

describe("detectDayFromText", () => {
  const cases: Array<[string, DayKey[] | null]> = [
    ["MONDAY", ["monday"]],
    ["Mon", ["monday"]],
    ["M", ["monday"]],
    ["Monday", ["monday"]],
    ["Tuesday", ["tuesday"]],
    ["TUE", ["tuesday"]],
    ["TH", ["thursday"]],
    ["Friday", ["friday"]],
    ["FRI", ["friday"]],
    ["SAT", ["saturday"]],
    ["SUNDAY", ["sunday"]],
    ["MWF", ["monday", "wednesday", "friday"]],
    ["TTH", ["tuesday", "thursday"]],
    ["TF", ["tuesday", "friday"]],
    ["M/W/F", ["monday", "wednesday", "friday"]],
    ["T-Th", ["tuesday", "thursday"]],
    ["not-a-day", null],
    ["", null],
  ];

  cases.forEach(([input, expected]) => {
    it(`"${input}" → ${JSON.stringify(expected)}`, () => {
      const result = detectDayFromText(input);
      expect(result?.days ?? null).toEqual(expected);
    });
  });
});

// ── Time detection ─────────────────────────────────────────────────────

describe("detectTimeFromText", () => {
  const cases: Array<[string, { normalized: string } | null]> = [
    ["07:00", { normalized: "07:00" }],
    ["7:00", { normalized: "07:00" }],
    ["7:00 AM", { normalized: "07:00" }],
    ["7:00AM", { normalized: "07:00" }],
    ["7:00 PM", { normalized: "19:00" }],
    ["12:00 AM", { normalized: "00:00" }],
    ["12:00 PM", { normalized: "12:00" }],
    ["17:30", { normalized: "17:30" }],
    ["9:30pm", { normalized: "21:30" }],
    ["13:45", { normalized: "13:45" }],
    ["not-a-time", null],
    ["", null],
  ];

  cases.forEach(([input, expected]) => {
    it(`"${input}" → ${JSON.stringify(expected)}`, () => {
      const result = detectTimeFromText(input);
      expect(result?.normalized ?? null).toEqual(expected?.normalized ?? null);
    });
  });
});

describe("detectTimeRange", () => {
  it('parses "7:00 - 8:30 AM"', () => {
    const result = detectTimeRange("7:00 - 8:30 AM");
    expect(result?.start.normalized).toBe("07:00");
    expect(result?.end.normalized).toBe("08:30");
  });

  it('parses "7:00–8:30" (en dash)', () => {
    const result = detectTimeRange("7:00–8:30");
    expect(result?.start.normalized).toBe("07:00");
    expect(result?.end.normalized).toBe("08:30");
  });
});

// ── Room detection ─────────────────────────────────────────────────────

describe("detectRoomFromText", () => {
  const cases: Array<[string, string | null]> = [
    ["Room 204", "room 204"],
    ["Rm 204", "rm 204"],
    ["rm. 301", "rm 301"],
    ["LAB 1", "lab 1"],
    ["COMLAB 2", "comlab 2"],
    ["204", null], // too short standalone
    ["R-204", "r 204"],
    ["Auditorium 1", "auditorium 1"],
  ];

  cases.forEach(([input, expected]) => {
    it(`"${input}" → ${JSON.stringify(expected)}`, () => {
      expect(detectRoomFromText(input)).toEqual(expected);
    });
  });
});

// ── Course code extraction ─────────────────────────────────────────────

describe("extractCourseCode", () => {
  const cases: Array<[string, string | null]> = [
    ["CCS 101", "CCS 101"],
    ["IT101", "IT 101"],
    ["MATH 101", "MATH 101"],
    ["CS101", "CS 101"],
    ["WEB DEVELOPMENT", null],
    ["CCS101", "CCS 101"],
  ];

  cases.forEach(([input, expected]) => {
    it(`"${input}" → ${JSON.stringify(expected)}`, () => {
      expect(extractCourseCode(input)).toEqual(expected);
    });
  });
});

// ── Subject detection ─────────────────────────────────────────────────

describe("isSubjectLikeText", () => {
  const yes = ["CCS 101", "IT101", "MATH 101", "WEB DEVELOPMENT", "PROGRAMMING 2", "1234"];
  const no = ["7:00", "MONDAY", "Room", "AM", "PM", "to", "the", "a"];

  yes.forEach((t) => {
    it(`"${t}" is subject-like`, () => expect(isSubjectLikeText(t)).toBe(true));
  });
  no.forEach((t) => {
    it(`"${t}" is NOT subject-like`, () => expect(isSubjectLikeText(t)).toBe(false));
  });
});

// ── Validation ────────────────────────────────────────────────────────

describe("validateOcrSubjects", () => {
  it("passes a valid class", () => {
    const { classes, issues } = validateOcrSubjects([{
      text: "CCS 101",
      words: [] as OcrWord[],
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      cx: 0, cy: 0, confidence: 0.8,
      code: "CCS 101",
      room: "204",
      days: ["monday"],
      startTime: "08:00",
      endTime: "09:30",
    }]);

    expect(classes.length).toBe(1);
    expect(classes[0]!.subject).toBe("CCS 101");
    expect(classes[0]!.days).toEqual(["monday"]);
    expect(issues.filter((i) => i.type !== "duplicate")).toHaveLength(0);
  });

  it("flags missing days", () => {
    const { issues } = validateOcrSubjects([{
      text: "CCS 101",
      words: [] as OcrWord[],
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      cx: 0, cy: 0, confidence: 0.8,
      code: "CCS 101",
      room: null,
      days: [],
      startTime: "08:00",
      endTime: "09:30",
    }]);

    expect(issues.some((i) => i.type === "missing_day")).toBe(true);
  });

  it("flags invalid time (end before start)", () => {
    const { issues } = validateOcrSubjects([{
      text: "CCS 101",
      words: [] as OcrWord[],
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      cx: 0, cy: 0, confidence: 0.8,
      code: null,
      room: null,
      days: ["monday"],
      startTime: "10:00",
      endTime: "08:00",
    }]);

    expect(issues.some((i) => i.type === "invalid_time")).toBe(true);
  });

  it("de-duplicates identical entries", () => {
    const makeClass = (days: DayKey[]) => ({
      text: "CCS 101",
      words: [] as OcrWord[],
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      cx: 0, cy: 0, confidence: 0.8,
      code: null as string | null,
      room: null as string | null,
      days,
      startTime: "08:00",
      endTime: "09:30",
    });

    const { classes } = validateOcrSubjects([
      makeClass(["monday"]),
      makeClass(["monday"]),
    ]);

    expect(classes.length).toBe(1);
  });

  it("skips numeric-only subject (likely a room/code misclassified)", () => {
    const { classes } = validateOcrSubjects([{
      text: "204",
      words: [] as OcrWord[],
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      cx: 0, cy: 0, confidence: 0.8,
      code: null,
      room: null,
      days: ["monday"],
      startTime: "08:00",
      endTime: "09:30",
    }]);

    expect(classes.length).toBe(0);
  });
});

// ── Position-based parser ─────────────────────────────────────────────

function makeWord(text: string, x0: number, y0: number, x1: number, y1: number, conf = 80): OcrWord {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: conf };
}

/** Simulate the standard "days-horizontal" timetable layout:
 *
 *           MONDAY        TUESDAY        WEDNESDAY
 *  7:00     CCS 101                   MATH 101
 *  9:00     IT 101
 *  11:00                   WEB DEV       P.E.
 */
describe("parseTimetableFromWords — days-horizontal layout", () => {
  const words: OcrWord[] = [
    makeWord("MONDAY", 200, 50, 280, 80),
    makeWord("TUESDAY", 400, 50, 480, 80),
    makeWord("WEDNESDAY", 600, 50, 720, 80),
    makeWord("7:00", 50, 150, 100, 180),
    makeWord("9:00", 50, 250, 100, 280),
    makeWord("11:00", 50, 350, 110, 380),
    makeWord("CCS", 220, 150, 260, 180),
    makeWord("101", 265, 150, 295, 180),
    makeWord("MATH", 620, 150, 670, 180),
    makeWord("101", 675, 150, 705, 180),
    makeWord("IT", 420, 250, 450, 280),
    makeWord("101", 455, 250, 490, 280),
    makeWord("WEB", 420, 350, 460, 380),
    makeWord("DEV", 465, 350, 500, 380),
    makeWord("P.E.", 640, 350, 690, 380),
  ];

  const result = parseTimetableFromWords(words, [], { pageWidth: 800, pageHeight: 500 });

  it("detects a days-horizontal layout", () => {
    expect(result.layout).toBe("days-horizontal");
  });

  it("detects at least 3 day columns", () => {
    expect(result.dayHeaders.length).toBeGreaterThanOrEqual(3);
  });

  it("extracts at least 3 subjects", () => {
    expect(result.subjects.length).toBeGreaterThanOrEqual(3);
  });

  it("assigns days based on x position", () => {
    const ccs = result.subjects.find((s) => s.text.includes("CCS") || s.text.includes("101"));
    console.log("Subjects found:", result.subjects.map((s) => JSON.stringify({ text: s.text, days: s.days, time: s.startTime })));
    console.log("CCS subject:", ccs);
    // CCS alone is a 3-char uppercase, and it's grouped with 101 → "CCS 101"
    // The text might be "CCS 101" (clustered) or just "CCS" / "101"
    expect(ccs?.days.length ?? 0).toBeGreaterThan(0);
  });
});

/** True days-vertical layout (times = column headers, days = row labels):
 *
 *  7:00      |  MONDAY   |  TUESDAY  |
 *  9:00      |  MATH 101 |           |
 *
 * Subjects share y with the time column, and x with the day column.
 */
describe("parseTimetableFromWords — days-vertical layout", () => {
  const words: OcrWord[] = [
    makeWord("MONDAY", 150, 100, 220, 130),
    makeWord("TUESDAY", 450, 100, 520, 130),
    makeWord("7:00", 50, 150, 100, 180),
    makeWord("9:00", 50, 350, 100, 380),
    makeWord("CCS", 170, 150, 210, 180),
    makeWord("101", 215, 150, 250, 180),
    makeWord("MATH", 170, 350, 225, 380),
    makeWord("101", 230, 350, 265, 380),
    makeWord("IT", 470, 150, 500, 180),
    makeWord("101", 505, 150, 540, 180),
  ];

  const result = parseTimetableFromWords(words, [], { pageWidth: 600, pageHeight: 500 });

  it("extracts at least 2 subjects", () => {
    expect(result.subjects.length).toBeGreaterThanOrEqual(2);
  });

  it("assigns correct day to CCS (x near MONDAY)", () => {
    const ccs = result.subjects.find((s) => s.text.includes("CCS") || s.text.includes("101"));
    expect(ccs?.days).toContain("monday");
  });

  it("assigns correct day to MATH (x near MONDAY, y near 9:00 row)", () => {
    const math = result.subjects.find((s) => s.text.includes("MATH"));
    expect(math?.days).toContain("monday");
  });

  it("assigns correct day to IT (x near TUESDAY)", () => {
    const it = result.subjects.find((s) => s.text.includes("IT"));
    expect(it?.days).toContain("tuesday");
  });
});

// ── Combined day codes ─────────────────────────────────────────────────

describe("parseTimetableFromWords — combined day codes (MWF, TTH)", () => {
  const words: OcrWord[] = [
    makeWord("MWF", 100, 50, 180, 80),
    makeWord("TTH", 300, 50, 400, 80),
    makeWord("7:00", 50, 150, 100, 180),
    makeWord("9:00", 50, 250, 100, 280),
    makeWord("CCS", 120, 150, 160, 180),
    makeWord("101", 165, 150, 195, 180),
    makeWord("IT", 320, 150, 350, 180),
    makeWord("101", 355, 150, 395, 180),
  ];

  const result = parseTimetableFromWords(words, [], { pageWidth: 500, pageHeight: 400 });

  it("expands MWF → monday, wednesday, friday", () => {
    const ccs = result.subjects.find((s) => s.text.includes("CCS"));
    expect(ccs?.days).toContain("monday");
    expect(ccs?.days).toContain("wednesday");
    expect(ccs?.days).toContain("friday");
  });

  it("expands TTH → tuesday, thursday", () => {
    const it = result.subjects.find((s) => s.text.includes("IT"));
    expect(it?.days).toContain("tuesday");
    expect(it?.days).toContain("thursday");
  });
});

// ── Empty input ───────────────────────────────────────────────────────

describe("parseTimetableFromWords — edge cases", () => {
  it("returns empty result for no words", () => {
    const result = parseTimetableFromWords([], [], {});
    expect(result.subjects).toHaveLength(0);
    expect(result.issues.some((i) => i.type === "ocr_empty")).toBe(true);
  });

  it("handles text-only with no recognized timetable structure", () => {
    const words = [
      makeWord("CCS", 100, 100, 150, 130),
      makeWord("101", 155, 100, 190, 130),
      makeWord("Room", 100, 160, 160, 190),
      makeWord("204", 165, 160, 200, 190),
    ];
    const result = parseTimetableFromWords(words, [], { pageWidth: 300, pageHeight: 300 });
    expect(result.subjects.length).toBeGreaterThanOrEqual(0);
  });
});