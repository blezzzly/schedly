import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/server/lib/guest-identity";
import { auditLog } from "@/server/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Guests idle this long are deleted. Their data is device-local by design. */
const GUEST_MAX_AGE_DAYS = 30;

/** Cap one run so a large backlog can't time the cron out. */
const BATCH_LIMIT = 500;

/** Rate-limit window rows older than this are dead weight. */
const RATE_LIMIT_ROW_MAX_AGE_HOURS = 48;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const guests = await purgeStaleGuests();
    const rateLimitRows = await purgeStaleRateLimitRows();
    const shareCodes = await purgeExpiredScheduleShares();

    auditLog("user.guest_cleanup", { guests, rateLimitRows, shareCodes });
    return NextResponse.json({ ok: true, guests, rateLimitRows, shareCodes });
  } catch (err) {
    console.error("[CRON_GUEST_CLEANUP] failed:", err);
    return NextResponse.json({ error: "cleanup failed" }, { status: 500 });
  }
}

/**
 * Delete guest accounts past their maximum age.
 *
 * Every guest is a real row (plus a session and a bcrypt hash) that nothing
 * else ever removes, so without this they accumulate forever in a table that
 * also holds real users. Deleting cascades away every row the guest owned.
 *
 * Scoped twice over: only `isAnonymous` rows, and only addresses in the guest
 * throwaway domain. A real user can never match.
 */
async function purgeStaleGuests(): Promise<{ scanned: number; deleted: number }> {
  const cutoff = new Date(Date.now() - GUEST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db.user.findMany({
    where: {
      isAnonymous: true,
      email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` },
      createdAt: { lt: cutoff },
    },
    select: { id: true },
    take: BATCH_LIMIT,
  });
  const ids = candidates.map((c: { id: string }) => c.id);

  if (candidates.length === 0) return { scanned: 0, deleted: 0 };

  const deleted = await db.user.deleteMany({
    where: { id: { in: ids } },
  });

  return { scanned: candidates.length, deleted: deleted.count };
}

/**
 * Drop rate-limit counter rows for windows that have long rolled over.
 *
 * The table is keyed by (key, windowStart) with one row per key per window, so
 * it grows monotonically — nothing ever removes a past window.
 */
async function purgeStaleRateLimitRows(): Promise<number> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_ROW_MAX_AGE_HOURS * 60 * 60 * 1000);
  const deleted = await db.rateLimitHit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return deleted.count;
}

/**
 * Drop expired schedule share codes.
 *
 * Share-code rows are the only thing in the app that expires on a timer rather
 * than being removed by their owner, so without a sweep they would accumulate
 * forever. Each row is small, but a stale code is still a guessable code.
 */
async function purgeExpiredScheduleShares(): Promise<number> {
  const deleted = await db.scheduleShare.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return deleted.count;
}
