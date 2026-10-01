/**
 * Schedule share codes.
 *
 * A code is the whole schedule, compressed into a string you can paste into
 * another account. It is deliberately self-contained rather than a short lookup
 * key backed by a row on the server: there is no table to add, nothing to expire
 * or clean up, no network round-trip to hand one out, and it still works after
 * the original account is deleted. That matters most for the guest case, where
 * a guest who shares their timetable should be able to hand it over without
 * creating anything durable first.
 *
 * The shape is a tuple array rather than an object of named fields, because
 * JSON keys dominate the payload once compressed — "subject", "instructor" and
 * "startTime" repeated per class costs more than the values themselves. Days go
 * in as a 7-character mask ("MTTF...") for the same reason.
 *
 * Format: `SCH1.<deflate-raw base64url>`. The prefix carries the version, so a
 * future format change can still decode old codes instead of failing confusingly.
 *
 * Compression is `node:zlib`'s `deflateRaw`, not the `ldrs` package that's
 * already a dependency. That package's root entry re-exports its web components,
 * which touch `HTMLElement` at import time and throw on the server; its
 * subpath exports only cover the spinner elements. `zlib` is built in, so this
 * costs no bundle and no dependency. Plain base64 without deflating measured
 * *worse* than the JSON (133% of it), so the compression is not optional.
 *
 * base64url (not standard base64) keeps the code to `[A-Za-z0-9_-]`, so it
 * survives copy/paste, chat apps that mangle newlines, and being put in a URL
 * without escaping.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";

const PREFIX = "SCH1.";
const DAY_CHARS = ["M", "T", "W", "H", "F", "S", "U"] as const;
const DAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type ShareableSchedule = {
  title: string;
  semester: string | null;
  academicYear: string | null;
  classes: {
    subject: string;
    shortName: string | null;
    code: string | null;
    instructor: string | null;
    room: string | null;
    section: string | null;
    block: string | null;
    notes: string | null;
    days: string[];
    /** `HH:MM`, 24-hour. */
    startTime: string;
    /** `HH:MM`, 24-hour. */
    endTime: string;
  }[];
};

type Payload = {
  v: 1;
  t: string;
  s: string | null;
  y: string | null;
  c: unknown[];
};

/** Formats a `Date` as local `HH:MM`. */
function toHhMm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function daysToMask(days: string[]): string {
  return DAY_CHARS.map((ch, i) => (days.includes(DAY_NAMES[i]!) ? ch : ".")).join("");
}

function maskToDays(mask: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < DAY_CHARS.length; i++) {
    if (mask[i] === DAY_CHARS[i]) out.push(DAY_NAMES[i]!);
  }
  return out;
}

/** Trim to a sane ceiling so a pasted blob can't be used to force a huge parse. */
export const MAX_CODE_LENGTH = 20_000;

export function encodeSchedule(schedule: ShareableSchedule): string {
  const payload: Payload = {
    v: 1,
    t: schedule.title,
    s: schedule.semester ?? null,
    y: schedule.academicYear ?? null,
    c: schedule.classes.map((c) => [
      c.subject,
      c.shortName ?? null,
      c.code ?? null,
      c.instructor ?? null,
      c.room ?? null,
      c.section ?? null,
      c.block ?? null,
      c.notes ?? null,
      daysToMask(c.days),
      c.startTime,
      c.endTime,
    ]),
  };
  return PREFIX + deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 }).toString("base64url");
}

export type DecodeResult =
  | { ok: true; schedule: ShareableSchedule }
  | { ok: false; error: string };

export function decodeSchedule(code: string): DecodeResult {
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!trimmed) return { ok: false, error: "Paste a schedule code first." };
  if (trimmed.length > MAX_CODE_LENGTH) {
    return { ok: false, error: "That code is too long to be a Schedly schedule." };
  }
  if (!trimmed.startsWith(PREFIX)) {
    return {
      ok: false,
      error: `That doesn't look like a Schedly schedule code — it should start with "${PREFIX}".`,
    };
  }

  let parsed: unknown;
  try {
    const json = inflateRawSync(Buffer.from(trimmed.slice(PREFIX.length), "base64url")).toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "That code is damaged and can't be read." };
  }

  return validatePayload(parsed);
}

function validatePayload(parsed: unknown): DecodeResult {
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "That code is damaged and can't be read." };
  }
  const p = parsed as Partial<Payload>;
  if (p.v !== 1 || typeof p.t !== "string" || !Array.isArray(p.c)) {
    return { ok: false, error: "That code is from an unsupported version." };
  }
  if (p.c.length === 0) {
    return { ok: false, error: "That schedule code has no classes in it." };
  }

  const classes: ShareableSchedule["classes"] = [];
  for (const raw of p.c) {
    if (!Array.isArray(raw)) return { ok: false, error: "That code is damaged and can't be read." };
    const [subject, shortName, code_, instructor, room, section, block, notes, mask, startTime, endTime] = raw as unknown[];

    // Everything is re-validated because this string came from someone else. It
    // is untrusted input no matter how well-formed it looks.
    if (typeof subject !== "string" || subject.length === 0) {
      return { ok: false, error: "That code is damaged and can't be read." };
    }
    if (typeof mask !== "string" || mask.length !== 7) {
      return { ok: false, error: "That code is damaged and can't be read." };
    }
    if (typeof startTime !== "string" || !/^\d{2}:\d{2}$/.test(startTime)) {
      return { ok: false, error: "That code is damaged and can't be read." };
    }
    if (typeof endTime !== "string" || !/^\d{2}:\d{2}$/.test(endTime)) {
      return { ok: false, error: "That code is damaged and can't be read." };
    }
    const days = maskToDays(mask);
    if (days.length === 0) {
      return { ok: false, error: "That code is damaged and can't be read." };
    }

    const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

    classes.push({
      subject,
      shortName: str(shortName),
      code: str(code_),
      instructor: str(instructor),
      room: str(room),
      section: str(section),
      block: str(block),
      notes: str(notes),
      days,
      startTime,
      endTime,
    });
  }

  return {
    ok: true,
    schedule: {
      title: p.t,
      semester: typeof p.s === "string" ? p.s : null,
      academicYear: typeof p.y === "string" ? p.y : null,
      classes,
    },
  };
}

/** Adapter from the DB shape (DateTime times) to the share shape (HH:MM). */
export function toShareable(
  schedule: ShareableSchedule & {
    classes: (ShareableSchedule["classes"][number] & {
      startTime: Date;
      endTime: Date;
    })[];
  },
): ShareableSchedule {
  return {
    title: schedule.title,
    semester: schedule.semester,
    academicYear: schedule.academicYear,
    classes: schedule.classes.map((c) => ({
      subject: c.subject,
      shortName: c.shortName,
      code: c.code,
      instructor: c.instructor,
      room: c.room,
      section: c.section,
      block: c.block,
      notes: c.notes,
      days: c.days,
      startTime: toHhMm(new Date(c.startTime)),
      endTime: toHhMm(new Date(c.endTime)),
    })),
  };
}
