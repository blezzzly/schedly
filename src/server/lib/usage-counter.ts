import { db } from "@/server/db/client";

/**
 * Daily usage counters for external-service caps (OpenRouter keys, Gemini,
 * QStash, Backblaze B2). Tracked so the admin Limits dashboard can show how
 * close each cap is to being full. Fire-and-forget: counter failures never
 * fail the underlying operation.
 */

export const USAGE_SERVICES = {
  OPENROUTER_1: "openrouter_1",
  OPENROUTER_2: "openrouter_2",
  OPENROUTER_3: "openrouter_3",
  OPENROUTER_4: "openrouter_4",
  OPENROUTER_5: "openrouter_5",
  OPENROUTER_6: "openrouter_6",
  OPENROUTER_7: "openrouter_7",
  OPENROUTER_8: "openrouter_8",
  OPENROUTER_9: "openrouter_9",
  OPENROUTER_10: "openrouter_10",
  GEMINI_1: "gemini_1",
  GEMINI_2: "gemini_2",
  GEMINI_3: "gemini_3",
  GEMINI_4: "gemini_4",
  GEMINI_5: "gemini_5",
  GEMINI_6: "gemini_6",
  GEMINI_7: "gemini_7",
  GEMINI_8: "gemini_8",
  GEMINI_9: "gemini_9",
  GEMINI_10: "gemini_10",
  QSTASH: "qstash",
  B2_UPLOAD: "b2_upload",
  B2_DOWNLOAD: "b2_download",
  GROQ_1: "groq_1",
  GROQ_2: "groq_2",
  GROQ_3: "groq_3",
  GROQ_4: "groq_4",
  GROQ_5: "groq_5",
  GROQ_6: "groq_6",
  GROQ_7: "groq_7",
  GROQ_8: "groq_8",
  GROQ_9: "groq_9",
  GROQ_10: "groq_10",
  BYTEZ_1: "bytez_1",
  BYTEZ_2: "bytez_2",
  BYTEZ_3: "bytez_3",
  BYTEZ_4: "bytez_4",
  BYTEZ_5: "bytez_5",
  BYTEZ_6: "bytez_6",
  BYTEZ_7: "bytez_7",
  BYTEZ_8: "bytez_8",
  BYTEZ_9: "bytez_9",
  BYTEZ_10: "bytez_10",
} as const;

export type UsageService = (typeof USAGE_SERVICES)[keyof typeof USAGE_SERVICES];

/** Philippines timezone (UTC+8) — used so the daily cap boundary matches
 *  local midnight, not UTC midnight (which is 8 AM PH time). */
const PH_TIMEZONE = "Asia/Manila";

/**
 * Local date key in Asia/Manila (e.g. "2026-08-13"). `toISOString()` would
 * return UTC, so before 8 AM PH the daily counters would roll over a day late.
 */
export function todayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Increment today's counter for a service (1 unit by default). */
export async function incrementUsage(
  service: UsageService,
  opts: { count?: number; bytes?: number } = {},
): Promise<void> {
  try {
    const date = todayKey();
    const count = opts.count ?? 1;
    const bytes = opts.bytes ?? 0;
    await db.usageCounter.upsert({
      where: { service_date: { service, date } },
      create: { service, date, count, bytes },
      update: {
        count: { increment: count },
        ...(bytes > 0 ? { bytes: { increment: bytes } } : {}),
      },
    });
  } catch (err) {
    console.error(`[USAGE] failed to increment ${service}:`, err);
  }
}

export type UsageSnapshot = {
  service: string;
  date: string;
  count: number;
  bytes: number;
};

/** All counter rows for a given day (defaults to today). */
export async function getUsage(date = todayKey()): Promise<UsageSnapshot[]> {
  const rows = await db.usageCounter.findMany({
    where: { date },
    select: { service: true, date: true, count: true, bytes: true },
  });
  return rows.map((r) => ({
    service: r.service,
    date: r.date,
    count: r.count,
    bytes: Number(r.bytes),
  }));
}

export type LimitSnapshotValue = {
  remaining: number | null;
  limit: number | null;
  resetAt: Date | null;
};

/**
 * Persist the provider-side rate-limit snapshot from response headers
 * (e.g. OpenRouter `x-ratelimit-remaining/limit/reset`). Fire-and-forget:
 * snapshot failures never fail the underlying operation.
 */
export async function saveLimitSnapshot(
  service: UsageService,
  snapshot: { remaining: number | null; limit: number | null; resetAt: string | null },
): Promise<void> {
  try {
    const toInt = (v: number | null): number | null =>
      v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
    const remaining = toInt(snapshot.remaining);
    const limit = toInt(snapshot.limit);
    // OpenRouter `x-ratelimit-reset` is SECONDS until the limit resets (e.g.
    // "3101"), not an epoch timestamp. Small durations are converted to an
    // absolute date; already-absolute epoch-ms values pass through unchanged.
    const resetAt =
      snapshot.resetAt && !Number.isNaN(Number(snapshot.resetAt))
        ? (() => {
            const raw = Number(snapshot.resetAt);
            if (raw > 0 && raw < 365 * 24 * 3600) return new Date(Date.now() + raw * 1000);
            return new Date(raw);
          })()
        : null;
    if (limit == null && remaining == null && resetAt == null) return;
    await db.limitSnapshot.upsert({
      where: { service },
      create: { service, remaining, limit, resetAt },
      update: { remaining, limit, resetAt },
    });
  } catch (err) {
    console.error(`[USAGE] failed to save limit snapshot for ${service}:`, err);
  }
}

/** Latest persisted limit snapshot per service. */
export async function getLimitSnapshots(): Promise<Record<string, LimitSnapshotValue>> {
  try {
    const rows = await db.limitSnapshot.findMany();
    const map: Record<string, LimitSnapshotValue> = {};
    for (const r of rows) {
      map[r.service] = { remaining: r.remaining, limit: r.limit, resetAt: r.resetAt };
    }
    return map;
  } catch (err) {
    console.error("[USAGE] failed to read limit snapshots:", err);
    return {};
  }
}
