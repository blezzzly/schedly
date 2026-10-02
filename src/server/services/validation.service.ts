export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  type: "overlap" | "duplicate" | "invalid_time" | "missing_field";
  severity: ValidationSeverity;
  message: string;
  classIndices: number[];
  field?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

interface ExtractedClassInput {
  subject: string;
  code?: string | null;
  instructor?: string | null;
  room?: string | null;
  section?: string | null;
  days: string[];
  startTime: string;
  endTime: string;
}

export function validateExtractedClasses(classes: ExtractedClassInput[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < classes.length; i++) {
    const c = classes[i];
    if (!c) continue;

    const startMinutes = toMinutes(c.startTime);
    const endMinutes = toMinutes(c.endTime);

    if (endMinutes !== null && startMinutes !== null && endMinutes <= startMinutes) {
      issues.push({
        type: "invalid_time",
        severity: "error",
        message: `"${c.subject || "Class " + (i + 1)}" ends before it starts (${c.startTime} → ${c.endTime})`,
        classIndices: [i],
        field: "endTime",
      });
    }

    if (!c.subject?.trim()) {
      issues.push({
        type: "missing_field",
        severity: "warning",
        message: `Class ${i + 1} is missing a subject name`,
        classIndices: [i],
        field: "subject",
      });
    }

    if (!c.days || c.days.length === 0) {
      issues.push({
        type: "missing_field",
        severity: "warning",
        message: `"${c.subject || "Class " + (i + 1)}" has no days selected`,
        classIndices: [i],
        field: "days",
      });
    }
  }

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i];
      const b = classes[j];
      if (!a || !b) continue;

      const aStart = toMinutes(a.startTime);
      const aEnd = toMinutes(a.endTime);
      const bStart = toMinutes(b.startTime);
      const bEnd = toMinutes(b.endTime);
      const sharedDays = a.days.filter((d) => b.days.includes(d));

      if (sharedDays.length > 0) {
        if (aStart !== null && aEnd !== null && bStart !== null && bEnd !== null && aStart < bEnd && bStart < aEnd) {
          issues.push({
            type: "overlap",
            severity: "warning",
            message: `"${a.subject}" overlaps with "${b.subject}" on ${sharedDays.join(", ")}`,
            classIndices: [i, j],
          });
        }
      }

      const sameSubject = normalizeSubject(a.subject) === normalizeSubject(b.subject);
      const sameCode =
        a.code && b.code && a.code.toLowerCase() === b.code.toLowerCase();
      const sameDays = a.days.length === b.days.length && a.days.every((d) => b.days.includes(d));
      const timesOverlap =
        aStart !== null && aEnd !== null && bStart !== null && bEnd !== null &&
        aStart < bEnd && bStart < aEnd;

      // A duplicate is the exact same class (subject + code + days AND an
      // overlapping time) or the same subject booked at the same time on
      // shared days (covers missing codes). Same subject at DIFFERENT times —
      // even on the same days — is a legitimate double-session (e.g. separate
      // cards for Tue 12-1:30 and Fri 4:30-6) and must never be flagged.
      const isDuplicate =
        (sameSubject && sameCode && sameDays && timesOverlap) ||
        (sameSubject && timesOverlap && sharedDays.length > 0);

      if (isDuplicate) {
        issues.push({
          type: "duplicate",
          severity: "warning",
          message: `"${a.subject}" appears to be a duplicate of class ${j + 1} (${a.startTime} → ${a.endTime})`,
          classIndices: [i, j],
        });
      }
    }
  }

  return {
    issues,
    hasErrors: issues.some((i) => i.severity === "error"),
    hasWarnings: issues.some((i) => i.severity === "warning"),
  };
}

function toMinutes(time: string): number | null {
  const parts = time.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function normalizeSubject(subject: string | undefined | null): string {
  return (subject ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
