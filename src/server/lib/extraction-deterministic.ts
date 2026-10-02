/**
 * Deterministic part of the extraction pipeline — everything that does NOT
 * require a network/AI call:
 *
 *   - merge duplicate classes by (subject + room + startTime + endTime)
 *   - normalize day tokens via the deterministic normalizer
 *   - discount confidence for ambiguous days
 *   - run consistency + conflict checks
 *
 * Kept in its own module so the benchmark suite can exercise it directly
 * (offline, deterministic) and the service layer stays free of test-only code.
 */

import { validateSchedule } from "./ai";
import { transformAiOutputToInternal, type ExtractionResult } from "@/server/validators/ai.schema";
import { normalizeDays } from "./day-normalizer";

export type { ExtractionResult };

const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Normalize a time string to 24-hour "HH:MM". Handles "01:30 PM", "1:30pm",
 * "13:00", and "7:30" (hour without leading zero → padded). Returns the input
 * unchanged when it cannot be parsed.
 */
export function normalizeTime(raw: unknown): string {
  if (typeof raw !== "string") return String(raw ?? "");
  const s = raw.trim();
  if (TIME_24H.test(s)) return s;

  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (m) {
    let h = parseInt(m[1]!, 10);
    const min = m[2] ? m[2] : "00";
    const mer = m[3]?.toLowerCase();
    if (Number.isNaN(h) || h < 0 || h > 23) return s;
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  return s;
}

export function renormalizeClasses(
  classes: ExtractionResult["classes"],
  confidence: number,
): { classes: ExtractionResult["classes"]; confidence: number; uncertain: boolean } {
  let uncertain = false;
  let minCertainty = 1;

  const out = classes.map((c) => {
    const norm = normalizeDays(c.days);
    if (norm.unmatched.length > 0 || norm.certainty < 1) uncertain = true;
    minCertainty = Math.min(minCertainty, norm.certainty);
    return { ...c, days: norm.days };
  });

  const adjustedConfidence = Math.max(0, Math.min(1, confidence * minCertainty));
  return { classes: out, confidence: adjustedConfidence, uncertain };
}

/** Build the final ExtractionResult from a raw AI JSON object. */
export function buildResult(raw: Record<string, unknown>): ExtractionResult | null {
  const aiClasses = raw.classes as Record<string, unknown>[] | undefined;
  if (!Array.isArray(aiClasses) || aiClasses.length === 0) return null;

  // 1. Map raw rows, normalizing times and collecting day tokens.
  const mapped = aiClasses.map((c: Record<string, unknown>) => {
    const days: string[] = Array.isArray(c.days)
      ? (c.days as string[]).map((d: string) => String(d).toLowerCase())
      : c.day
        ? [String(c.day).toLowerCase()]
        : [];
    return {
      subject: String(c.subject ?? ""),
      code: c.courseCode ? String(c.courseCode) : ((c.code as string) ?? null),
      instructor: (c.instructor as string) ?? null,
      room: (c.room as string) ?? null,
      section: (c.section as string) ?? null,
      block: (c.block as string) ?? null,
      notes: (c.notes as string) ?? null,
      days,
      startTime: normalizeTime(c.startTime),
      endTime: normalizeTime(c.endTime),
    };
  });

  // 2. De-duplicate by unique key (subject + room + startTime + endTime),
  //    merging day tokens (covers merged-cell / repeated OCR rows).
  const uniqueKey = (c: (typeof mapped)[number]) =>
    `${c.subject.toLowerCase()}|${String(c.room ?? "").toLowerCase()}|${c.startTime}|${c.endTime}`;
  const merged = new Map<string, (typeof mapped)[number]>();
  for (const c of mapped) {
    const k = uniqueKey(c);
    const existing = merged.get(k);
    if (existing) {
      const daySet = new Set([...existing.days, ...c.days]);
      existing.days = [...daySet];
    } else {
      merged.set(k, { ...c, days: [...c.days] });
    }
  }
  const classes = [...merged.values()];

  const transformed = {
    semester: (raw.semester as string) ?? null,
    classes,
    metadata: {
      totalClasses: classes.length,
      confidence:
        ((raw.metadata as Record<string, unknown>)?.confidence as number) ?? 0.5,
      notes: ((raw.metadata as Record<string, unknown>)?.notes as string) ?? null,
    },
  } as unknown as ExtractionResult;

  const scheduleCheck = validateSchedule(raw);
  const fixed = renormalizeClasses(
    transformed.classes,
    transformed.metadata.confidence,
  );
  transformed.classes = fixed.classes;
  transformed.metadata = {
    ...transformed.metadata,
    confidence: fixed.confidence,
    consistencyScore: scheduleCheck.consistency.score,
    hasConflicts: scheduleCheck.hasConflicts,
    conflicts: scheduleCheck.conflicts,
    consistencyIssues: scheduleCheck.consistency.issues,
  };

  return transformed;
}

/** Run the deterministic consistency/conflict pass on an already-validated AI result. */
export function finalizeValidated(validated: Record<string, unknown>): ExtractionResult {
  const transformed = transformAiOutputToInternal(
    validated as unknown as Parameters<typeof transformAiOutputToInternal>[0],
  );
  const scheduleCheck = validateSchedule(validated);
  const fixed = renormalizeClasses(transformed.classes, transformed.metadata.confidence);
  transformed.classes = fixed.classes;
  transformed.metadata = {
    ...transformed.metadata,
    confidence: fixed.confidence,
    consistencyScore: scheduleCheck.consistency.score,
    hasConflicts: scheduleCheck.hasConflicts,
    conflicts: scheduleCheck.conflicts,
    consistencyIssues: scheduleCheck.consistency.issues,
  };
  return transformed;
}
