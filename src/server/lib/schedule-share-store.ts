import { db } from "@/server/db/client";
import { decodeSchedule, encodeSchedule, type ShareableSchedule } from "@/lib/schedule-share";

/**
 * Short share codes: six digits a person can read out loud or dictate, instead
 * of a 700-character blob.
 *
 * Six digits buys that only by giving up self-contained codes — 1,000,000
 * combinations cannot hold a compressed schedule, so the payload lives here.
 * That makes this the one share path in the app with server-side state, which is
 * why the compensating controls are strict:
 *
 *  - 24-hour expiry. A code is for handing a timetable to a classmate today, not
 *    a permanent public link.
 *  - Single use, marked by `usedAt` at import time. Replaying a leaked code a
 *    second time would double the window an attacker has with it.
 *  - Rate-limited lookups. Six digits is small enough to enumerate: at 20 tries
 *    a minute, a full sweep of the space takes about three weeks, so the limit
 *    is what makes enumeration impractical rather than merely slow.
 *  - The payload is still validated on import (see `importScheduleFromCode`).
 *    A code an attacker guessed is indistinguishable from a real one, so the
 *    import path treats it as untrusted input regardless of provenance.
 */

/** How long a code stays valid. */
export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

/** Lookup attempts allowed per user per window. */
const LOOKUP_LIMIT = 20;
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;

/** Codes shorter or longer than this are not ours — reject before hitting the DB. */
const CODE_RE = /^\d{6}$/;

export function isValidCodeShape(code: string): boolean {
  return CODE_RE.test(code.trim());
}

/**
 * Rejection is deliberately uniform for "no such code", "expired" and "already
 * used". Distinguishing them would let someone probe which six-digit strings
 * were ever real, which is the only signal a brute-force run actually needs.
 */
const NOT_FOUND = { ok: false as const, error: "That code isn't valid, or it has expired." };

export async function createShareCode(
  userId: string,
  scheduleId: string,
  schedule: ShareableSchedule,
): Promise<{ ok: true; code: string; expiresAt: Date } | { ok: false; error: string }> {
  const payload = encodeSchedule(schedule);
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS);

  // 1M codes against however many rows exist: collisions are rare, but they are
  // guaranteed eventually, so this retries rather than assuming a free draw.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
    try {
      await db.scheduleShare.create({
        data: { code, scheduleId, userId, payload, expiresAt },
        select: { code: true, expiresAt: true },
      });
      return { ok: true, code, expiresAt };
    } catch (err) {
      // Unique-violation only. Anything else is a real failure and retrying
      // would just repeat it.
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") continue;
      console.error("[SHARE_CREATE]", err);
      return { ok: false, error: "Couldn't create a share code. Please try again." };
    }
  }
  return { ok: false, error: "Couldn't find a free code. Please try again." };
}

export type ShareLookup =
  | { ok: true; schedule: ShareableSchedule }
  | { ok: false; error: string };

/**
 * Resolve a code to a schedule. Does NOT consume it — `consumeShareCode` runs
 * only once the import has actually succeeded, so a user who mistypes or a
 * transient DB failure doesn't burn their own code.
 */
export async function peekShareCode(code: string): Promise<ShareLookup> {
  const trimmed = code.trim();
  if (!isValidCodeShape(trimmed)) return NOT_FOUND;

  const row = await db.scheduleShare.findUnique({
    where: { code: trimmed },
    select: { payload: true, expiresAt: true, usedAt: true },
  });

  if (!row || row.usedAt !== null || row.expiresAt.getTime() < Date.now()) return NOT_FOUND;

  const decoded = decodeSchedule(row.payload);
  // A stored payload we cannot read means the row is corrupt, not that the
  // person typed it wrong — same uniform message either way.
  if (!decoded.ok) return NOT_FOUND;

  return { ok: true, schedule: decoded.schedule };
}

/** Mark a code spent. Called only after a successful import. */
export async function consumeShareCode(code: string): Promise<void> {
  await db.scheduleShare
    .updateMany({
      where: { code: code.trim(), usedAt: null },
      data: { usedAt: new Date() },
    })
    .catch((err: unknown) => {
      // Losing the spend flag means the code could be reused once. Not worth
      // failing an import the user already got — the expiry still bounds it.
      console.error("[SHARE_CONSUME]", err);
    });
}

/** Rate-limit key for one user's lookups. */
export function lookupRateLimitKey(userId: string): string {
  return `share_lookup:${userId}`;
}

export { LOOKUP_LIMIT, LOOKUP_WINDOW_MS };

/** Drop codes past their expiry. Called from the existing cleanup cron. */
export async function purgeExpiredShares(): Promise<number> {
  const deleted = await db.scheduleShare.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return deleted.count;
}
