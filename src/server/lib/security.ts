const IMAGE_MAGIC_BYTES: [number[], string][] = [
  [[0xFF, 0xD8, 0xFF], "image/jpeg"],
  [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png"],
  [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], "image/gif"],
  [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif"],
  [[0x52, 0x49, 0x46, 0x46], "image/webp"], // RIFF header — verify WEBP at offset 8
  [[0x42, 0x4D], "image/bmp"],
];

const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

export function detectImageMime(buffer: Uint8Array): string | null {
  for (const [magic, mime] of IMAGE_MAGIC_BYTES) {
    if (magic.length > buffer.length) continue;
    if (magic.every((b, i) => buffer[i] === b)) {
      if (mime === "image/webp") {
        if (WEBP_MAGIC.every((b, i) => buffer[8 + i] === b)) return mime;
        continue;
      }
      return mime;
    }
  }
  return null;
}

// Simple in-memory sliding window rate limiter
const rateStore = new Map<string, number[]>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, timestamps] of rateStore) {
    const valid = timestamps.filter((t) => now - t < 60_000);
    if (valid.length === 0) rateStore.delete(key);
    else rateStore.set(key, valid);
  }
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number } {
  cleanup();
  const now = Date.now();
  const timestamps = rateStore.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  valid.push(now);
  rateStore.set(key, valid);
  return {
    allowed: valid.length <= maxRequests,
    remaining: Math.max(0, maxRequests - valid.length),
  };
}

// DB-backed rate limit that is shared across serverless instances (the
// in-memory `checkRateLimit` above is per-instance and silently resets on
// scale-out). Uses a fixed window per key; each window row expires naturally
// once a newer window is created, so the table stays small without a cleanup
// job. Falls back to an in-memory check if the DB is unreachable — fail-open
// would defeat the purpose, fail-closed could lock everyone out, so be
// lenient for availability but still bound by a sane default.
export async function checkRateLimitDb(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000,
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  try {
    const { db } = await import("@/server/db/client");

    const row = await db.rateLimitHit.upsert({
      where: { key_windowStart: { key, windowStart } },
      update: { count: { increment: 1 } },
      create: { key, windowStart, count: 1 },
    });

    return {
      allowed: row.count <= maxRequests,
      remaining: Math.max(0, maxRequests - row.count),
    };
  } catch (err) {
    console.error("[RATE_LIMIT_DB]", err);
    // Fallback: best-effort in-process guard so we never open a full hole.
    const fallback = checkRateLimit(`db-fallback:${key}`, maxRequests, windowMs);
    return fallback;
  }
}

// Read a rate-limit window WITHOUT incrementing it.
//
// `checkRateLimitDb` increments on every call, which makes it unusable as a
// pre-flight check: a rejected request still burns quota, and a request that
// fails downstream is charged for work it never did. Use this to decide
// whether to proceed, then call `checkRateLimitDb` to commit only once the
// work actually succeeded.
//
// Fails OPEN if the DB is unreachable: a counter read must never be the reason
// a legitimate user is turned away.
export async function peekRateLimitDb(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000,
): Promise<{ allowed: boolean; remaining: number; count: number }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  try {
    const { db } = await import("@/server/db/client");
    const row = await db.rateLimitHit.findUnique({
      where: { key_windowStart: { key, windowStart } },
      select: { count: true },
    });
    const count = row?.count ?? 0;
    return {
      allowed: count < maxRequests,
      remaining: Math.max(0, maxRequests - count),
      count,
    };
  } catch (err) {
    console.error("[RATE_LIMIT_DB_PEEK]", err);
    return { allowed: true, remaining: maxRequests, count: 0 };
  }
}

const CSRF_HEADER = "x-csrf-protection";
const CSRF_VALUE = "1";

export function validateCsrf(request: Request): boolean {
  return request.headers.get(CSRF_HEADER) === CSRF_VALUE;
}
