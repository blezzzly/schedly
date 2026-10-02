/**
 * Deterministic day-abbreviation parser.
 *
 * Day expansion is NEVER delegated to the AI model — models expand combined
 * codes inconsistently (e.g. returning Thursday for "TF" instead of Friday).
 * Every day token coming from any source (vision model, Hy3, OCR) is resolved
 * HERE, by exact token matching, before it is stored or used for conflict
 * detection. This is the single source of truth for day parsing.
 *
 * Matching is exact-token only: "TH" -> Thursday, "T" -> Tuesday, "TF" ->
 * Tuesday + Friday. There is no substring matching, so tokens can never be
 * partially matched (the old bug where "TF" was confused with "TH").
 */

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const FULL_DAYS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** Single-token -> canonical day. Exact match only (case-insensitive). */
const DAY_MAP: Record<string, DayKey> = {
  M: "monday",
  MON: "monday",
  MOND: "monday",
  MONDAY: "monday",

  T: "tuesday",
  TUE: "tuesday",
  TU: "tuesday",
  TUES: "tuesday",
  TUESDAY: "tuesday",

  W: "wednesday",
  WED: "wednesday",
  WEDS: "wednesday",
  WEDNESDAY: "wednesday",

  TH: "thursday",
  THU: "thursday",
  THUR: "thursday",
  THURS: "thursday",
  THURSDAY: "thursday",

  F: "friday",
  FRI: "friday",
  FRIDAY: "friday",

  SAT: "saturday",
  SATU: "saturday",
  SATURDAY: "saturday",

  SUN: "sunday",
  SUNH: "sunday",
  SUNDA: "sunday",
  SUNDAY: "sunday",
};

/**
 * Combined codes -> canonical days. Order matters: longer / combined tokens
 * are matched before any single-letter interpretation, so "TF" maps to
 * Tuesday + Friday and never to Thursday.
 */
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
};

export interface NormalizedDays {
  days: DayKey[];
  /** 1 = unambiguous, <1 = had to infer / uncertain input */
  certainty: number;
  /** tokens that could not be resolved at all */
  unmatched: string[];
}

function resolveToken(token: string): { days: DayKey[]; certain: boolean } | null {
  const key = token.trim().toUpperCase();
  if (!key) return null;

  // 1. Combined code (exact match).
  const combo = COMBO_MAP[key];
  if (combo) return { days: combo, certain: true };

  // 2. Single day token (exact match).
  const single = DAY_MAP[key];
  if (single) return { days: [single], certain: true };

  // 3. Slash / dash / space / dot separated combos, e.g. "M/W/F", "T-Th", "MW F".
  if (/[/\-.\s]/.test(token)) {
    const parts = token.split(/[/\-.\s]+/).filter(Boolean);
    if (parts.length > 0) {
      const resolved: DayKey[] = [];
      let allCertain = true;
      for (const p of parts) {
        const m = resolveToken(p);
        if (m) {
          resolved.push(...m.days);
          if (!m.certain) allCertain = false;
        } else {
          allCertain = false;
        }
      }
      if (resolved.length > 0) return { days: resolved, certain: allCertain };
    }
  }

  return null;
}

/**
 * Normalize a raw day value (string or array of strings) coming from the AI
 * model into canonical lowercase DayKeys. Handles combined codes returned as a
 * single token (e.g. "TF") as well as already-expanded arrays.
 */
export function normalizeDays(input: unknown): NormalizedDays {
  const tokens: string[] = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") tokens.push(item);
    }
  } else if (typeof input === "string" && input.trim()) {
    tokens.push(input);
  }

  const days = new Set<DayKey>();
  const unmatched: string[] = [];
  let certaintySum = 0;
  let certaintyCount = 0;

  for (const token of tokens) {
    const matched = resolveToken(token);
    if (matched) {
      matched.days.forEach((d) => days.add(d));
      certaintySum += matched.certain ? 1 : 0.4;
      certaintyCount += 1;
    } else {
      unmatched.push(token);
      certaintySum += 0.1;
      certaintyCount += 1;
    }
  }

  const certainty = certaintyCount === 0 ? 1 : Math.max(0.1, certaintySum / certaintyCount);

  return {
    days: DAY_KEYS.filter((d) => days.has(d)),
    certainty,
    unmatched,
  };
}

export function formatDay(token: DayKey): string {
  return FULL_DAYS[token];
}
