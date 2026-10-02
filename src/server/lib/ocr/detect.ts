/**
 * Detects and normalizes timetable tokens (days, times, rooms).
 *
 * Each detector is stateless — they take a raw string and return either
 * a canonical value (with metadata) or null. The position-based parser
 * composes them with OCR bounding boxes to attach metadata to detected
 * subjects.
 */

import type { DayKey } from "./types";

// ── Day codes ─────────────────────────────────────────────────────────────
// Single tokens only — combined codes (TTH, MWF, etc.) are handled in
// `expandDayCombo`. We deliberately use exact-token matching so "TF" can
// never resolve to "Thursday".
const DAY_MAP: Record<string, DayKey> = {
  M: "monday", MON: "monday", MOND: "monday", MONDAY: "monday",
  T: "tuesday", TUE: "tuesday", TU: "tuesday", TUES: "tuesday", TUESDAY: "tuesday",
  W: "wednesday", WED: "wednesday", WEDS: "wednesday", WEDNESDAY: "wednesday",
  TH: "thursday", THU: "thursday", THUR: "thursday", THURS: "thursday", THURSDAY: "thursday",
  F: "friday", FRI: "friday", FRIDAY: "friday",
  SAT: "saturday", SATU: "saturday", SATURDAY: "saturday",
  SUN: "sunday", SUNH: "sunday", SUNDA: "sunday", SUNDAY: "sunday",
};

const COMBO_MAP: Record<string, DayKey[]> = {
  MWF: ["monday", "wednesday", "friday"],
  MTW: ["monday", "tuesday", "wednesday"],
  TTH: ["tuesday", "thursday"],
  TF: ["tuesday", "friday"],
  TTHS: ["tuesday", "thursday", "saturday"],
  MW: ["monday", "wednesday"],
  TFU: ["tuesday", "friday", "sunday"],
  WTF: ["wednesday", "tuesday", "friday"],
  MTH: ["monday", "thursday"],
  TTHF: ["tuesday", "thursday", "friday"],
  MWTH: ["monday", "wednesday", "thursday"],
  SATH: ["saturday", "thursday"],
  SUNTH: ["sunday", "thursday"],
  SATSUN: ["saturday", "sunday"],
  TTHSS: ["tuesday", "thursday", "saturday", "sunday"],
  SATSU: ["saturday", "sunday"],
};

export interface DayMatch {
  days: DayKey[];
  /** 1 = exact match, 0.6 = combined code, 0.3 = fuzzy */
  certainty: number;
  matchedText: string;
}

export function detectDayFromText(text: string): DayMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();

  // Combined code
  if (COMBO_MAP[upper]) {
    return { days: COMBO_MAP[upper]!, certainty: 0.95, matchedText: trimmed };
  }

  // Single day token
  if (DAY_MAP[upper]) {
    return { days: [DAY_MAP[upper]!], certainty: 1, matchedText: trimmed };
  }

  // Slash / dash / space / dot separated combos (e.g. "M/W/F", "T-Th")
  if (/[/\-.\s]/.test(trimmed)) {
    const parts = trimmed.split(/[/\-.\s]+/).filter(Boolean);
    if (parts.length > 1) {
      const resolved: DayKey[] = [];
      let allCertain = true;
      for (const p of parts) {
        const m = detectDayFromText(p);
        if (m) {
          resolved.push(...m.days);
          if (m.certainty < 1) allCertain = false;
        } else {
          allCertain = false;
        }
      }
      if (resolved.length > 0) {
        return { days: resolved, certainty: allCertain ? 0.9 : 0.6, matchedText: trimmed };
      }
    }
  }

  return null;
}

// ── Time detection ───────────────────────────────────────────────────────

const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface TimeMatch {
  /** "HH:MM" 24-hour */
  normalized: string;
  raw: string;
  /** 1 = 24h format, 0.9 = 12h format, 0.6 = ambiguous, 0.4 = no meridiem */
  certainty: number;
}

export function detectTimeFromText(text: string): TimeMatch | null {
  const s = text.trim();
  if (!s) return null;

  // Normalize OCR artifacts: "0230PM" → "02:30PM", "0900AM" → "09:00AM"
  let normalized = s;
  const compact = s.match(/^(\d{2})(\d{2})([AaPp][Mm])$/);
  if (compact) {
    normalized = `${compact[1]}:${compact[2]}${compact[3]}`;
  }

  const n = normalized.trim();
  if (!n) return null;

  // Pure 24-hour
  if (TIME_24H.test(n)) return { normalized: n, raw: s, certainty: 1 };

  // 12-hour with am/pm: "7:00 AM", "7:00AM", "7AM", "7 PM"
  const m12 = n.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (m12) {
    let h = parseInt(m12[1]!, 10);
    const min = m12[2] ? m12[2] : "00";
    const mer = m12[3]!.toLowerCase();
    if (h < 0 || h > 23) return null;
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return { normalized: `${pad(h)}:${min}`, raw: s, certainty: 0.95 };
  }

  // 12-hour with meridiem attached: "7:00am"
  const m12b = n.match(/^(\d{1,2}):(\d{2})([AaPp][Mm])$/);
  if (m12b) {
    let h = parseInt(m12b[1]!, 10);
    const min = m12b[2]!;
    const mer = m12b[3]!.toLowerCase();
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return { normalized: `${pad(h)}:${min}`, raw: s, certainty: 0.95 };
  }

  // Pure numeric "7:00" or "07:00" without am/pm — heuristic context.
  const m = n.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1]!, 10);
    const min = m[2]!;
    if (h < 0 || h > 23) return null;
    return { normalized: `${pad(h)}:${min}`, raw: s, certainty: 0.6 };
  }

  // 1-2 digit hour with no colon and no meridiem (e.g. "7", "7 AM", "7PM")
  // Skip this for 4-digit numeric strings like "1234" — those are ambiguous
  // and more likely course codes / room numbers than times.
  if (/^\d{1,2}$/.test(n)) {
    const h = parseInt(n, 10);
    if (h >= 0 && h <= 23) {
      return { normalized: `${pad(h)}:00`, raw: s, certainty: 0.4 };
    }
  }

  // "7:30pm" (lowercase) — covered by first regex but safety net
  const mLower = n.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/);
  if (mLower) {
    let h = parseInt(mLower[1]!, 10);
    const min = mLower[2]!;
    const mer = mLower[3]!.toLowerCase();
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return { normalized: `${pad(h)}:${min}`, raw: s, certainty: 0.9 };
  }

  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Detect a time-range string like "7:00 - 8:30 AM" or "07:00–08:30".
 * Returns null when the input doesn't look like a range.
 */
export function detectTimeRange(text: string): { start: TimeMatch; end: TimeMatch } | null {
  const s = text.trim();

  // Split on common range separators: -, –, —, ~, to
  const parts = s.split(/\s*(?:-|–|—|~|\bto\b)\s*/i);
  if (parts.length !== 2) return null;

  const start = detectTimeFromText(parts[0]!);
  const end = detectTimeFromText(parts[1]!);
  if (!start || !end) return null;

  return { start, end };
}

// ── Room detection ────────────────────────────────────────────────────────

export function detectRoomFromText(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 30) return null;

  // "Room 204", "Rm 305", "LAB 1", "COMLAB 2", "R-204", "Rm. 204", "R204"
  const prefixMatch = t.match(
    /^(room|rm|r\.?|lab|comlab|aud(?:itorium)?|hall)\s*[-.]?\s*(\d{1,4}[A-Za-z]?)$/i
  );
  if (prefixMatch) {
    const prefix = prefixMatch[1]!.toLowerCase().replace(/\.$/, "");
    const number = prefixMatch[2]!.toUpperCase();
    return `${prefix} ${number}`;
  }

  // "R-204", "R 204" style (prefix letter + separator + number)
  const rDash = t.match(/^r\s*[- ]\s*(\d{2,4})$/i);
  if (rDash) return `r ${rDash[1]!.toUpperCase()}`;

  // Pure 3-digit room numbers (only). 4-digit numbers like "1234" are more
  // likely course codes or time tokens than room identifiers.
  if (/^[3-9]\d{2}$/.test(t)) {
    return t.toUpperCase();
  }

  return null;
}

// ── Course code detection ─────────────────────────────────────────────────

const COURSE_CODE = /^([A-Za-z]{2,6})\s*[-]?\s*(\d{2,4}[-]?\d*)$/;

export function extractCourseCode(text: string): string | null {
  const m = text.match(COURSE_CODE);
  if (m) {
    return `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}`;
  }
  // 3-4 digit standalone (could be a course code in some formats)
  if (/^\d{3,4}$/.test(text.trim())) {
    return text.trim();
  }
  return null;
}

// ── Subject detection ─────────────────────────────────────────────────────

const NOISE_WORDS = new Set([
  "room", "rm", "lab", "class", "course", "noon", "lunch", "break", "am", "pm",
  "to", "the", "and", "of", "section", "block",
]);

export function isSubjectLikeText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 2) return false;
  if (detectTimeFromText(t)) return false;
  if (detectDayFromText(t)) return false;
  if (detectRoomFromText(t)) return false;
  if (NOISE_WORDS.has(t.toLowerCase())) return false;
  if (/^[a-z]{1,2}$/.test(t)) return false; // single lowercase letter

  // Course codes: "CCS 101", "CS101", "MATH 101"
  if (COURSE_CODE.test(t)) return true;
  // Numeric codes
  if (/^\d{3,4}$/.test(t)) return true;
  // Short uppercase abbreviation (course prefix like "CCS", "CS", "MATH")
  // Pairing with a number is handled by cluster joining in parse-words.
  if (/^[A-Z]{2,6}$/.test(t)) return true;
  // Multi-word subject (must contain a number or be 4+ letters)
  if (/\d/.test(t) && t.length >= 4) return true;
  if (t.length >= 6 && /[A-Za-z]/.test(t)) return true;

  return false;
}