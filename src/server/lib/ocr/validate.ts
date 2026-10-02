/**
 * Post-parse validation for OCR-extracted schedules.
 *
 * Verifies every entry against structural rules and tags each one with a
 * confidence score the user can see in the review screen. Entries that fail
 * validation are kept (with a warning) so the user can manually fix them
 * rather than having them silently dropped.
 */

import type { DetectedSubject, ValidationIssue } from "./types";

export interface ValidatedClass {
  subject: string;
  code: string | null;
  room: string | null;
  instructor: string | null;
  days: DetectedSubject["days"];
  startTime: string;
  endTime: string;
  confidence: number;
  warnings: string[];
}

export interface ValidationResult {
  classes: ValidatedClass[];
  issues: ValidationIssue[];
}

export function validateOcrSubjects(subjects: DetectedSubject[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  const seen = new Map<string, ValidatedClass>();

  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i]!;
    const warnings: string[] = [];

    // ── Subject must be non-empty
    if (!s.text || !s.text.trim()) {
      issues.push({ type: "missing_subject", message: "Empty subject", classIndex: i });
      continue;
    }

    // ── Subject should not be just digits (rooms/codes get misclassified as subjects)
    if (/^\d+$/.test(s.text.trim())) {
      issues.push({ type: "missing_subject", message: `Suspicious numeric value "${s.text}"`, classIndex: i });
      continue;
    }

    // ── Day validation
    if (s.days.length === 0) {
      warnings.push("Day not detected — please verify");
      issues.push({ type: "missing_day", message: `No day detected for "${s.text}"`, classIndex: i });
    }

    // ── Time validation
    let startTime = s.startTime;
    let endTime = s.endTime;
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
      warnings.push("Start time missing");
      startTime = "09:00";
      issues.push({ type: "missing_time", message: `No time for "${s.text}"`, classIndex: i });
    }
    if (!endTime || !/^\d{2}:\d{2}$/.test(endTime)) {
      endTime = addHour(startTime);
    }

    // Start must be before end
    const timeParts = startTime.split(":").map(Number);
    const sh = timeParts[0] ?? 0;
    const sm = timeParts[1] ?? 0;
    const endParts = endTime.split(":").map(Number);
    const eh = endParts[0] ?? 0;
    const em = endParts[1] ?? 0;
    if (sh * 60 + sm >= eh * 60 + em) {
      warnings.push("End time must be after start time");
      endTime = addHour(startTime);
      issues.push({ type: "invalid_time", message: `Invalid time range for "${s.text}"`, classIndex: i });
    }

    // ── Room sanity check
    if (s.room && s.room.length > 20) {
      warnings.push("Room value looks unusual");
      issues.push({ type: "invalid_room", message: `Suspicious room value "${s.room}"`, classIndex: i });
    }

    // ── Confidence threshold
    if (s.confidence < 0.3) {
      warnings.push("Low confidence — please review carefully");
      issues.push({ type: "low_confidence", message: `Low confidence for "${s.text}"`, classIndex: i });
    }

    const key = `${s.text.toLowerCase()}|${s.days.join(",")}|${startTime}`;
    const existing = seen.get(key);
    const validated: ValidatedClass = {
      subject: s.text.trim(),
      code: s.code,
      room: s.room,
      instructor: null,
      days: s.days,
      startTime,
      endTime,
      confidence: Math.round(s.confidence * 100) / 100,
      warnings,
    };

    if (!existing || validated.confidence > existing.confidence) {
      seen.set(key, validated);
    }
  }

  // ── Duplicate detection ──
  const all = [...seen.values()];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      if (a.subject.toLowerCase() === b.subject.toLowerCase() && a.startTime === b.startTime && a.endTime === b.endTime) {
        const shared = a.days.filter((d) => b.days.includes(d));
        if (shared.length > 0) {
          issues.push({
            type: "duplicate",
            message: `Duplicate entry: "${a.subject}" on ${shared.join(", ")}`,
            classIndex: i,
          });
        }
      }
    }
  }

  return { classes: all, issues };
}

function addHour(time24: string): string {
  const parts = time24.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const total = h * 60 + m + 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}