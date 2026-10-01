import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { createGuestSession } from "@/server/lib/guest";
import { checkRateLimitDb, peekRateLimitDb, validateCsrf } from "@/server/lib/security";
import { auditLog } from "@/server/lib/audit";

export const runtime = "nodejs";

/**
 * POST /api/auth/guest — "Continue without an account".
 *
 * Idempotent: if the caller already has a session we just report who they are
 * rather than minting a second user, so a double tap (or a retried request)
 * can't strand someone with a throwaway account.
 */
export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (session?.user) {
    return NextResponse.json({
      ok: true,
      userId: session.user.id,
      alreadySignedIn: true,
      isAnonymous: (session.user as { isAnonymous?: boolean }).isAnonymous === true,
    });
  }

  // Past this point the caller has no session, so they're asking for a brand
  // new guest row.
  //
  // Peek (don't increment) BEFORE creating, so an over-limit caller is turned
  // away without leaving an orphan row, and a creation that later fails isn't
  // charged for work it never did. The matching increment happens only after
  // the row actually exists.
  const ip = clientIp(request);
  const limit = guestCreateLimit();
  if (limit) {
    const rate = await peekRateLimitDb(`guest:create:${ip}`, limit, 60 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: "Too many guest sessions from this network. Please try again later.",
          retryAfterMinutes: retryAfterMinutes(60 * 60_000),
        },
        { status: 429, headers: { "Retry-After": String(retryAfterMinutes(60 * 60_000) * 60) } }
      );
    }
  }

  try {
    // The client may suggest a persona name, but `createGuestSession` only
    // accepts values from our own list — anything else is replaced.
    const body = await request.json().catch(() => null) as { name?: unknown } | null;
    const { userId, handle, name, setCookies } = await createGuestSession({
      name: typeof body?.name === "string" ? body.name : undefined,
    });

    // Commit the quota only now that a real row exists.
    if (limit) {
      const rate = await checkRateLimitDb(`guest:create:${ip}`, limit, 60 * 60_000);
      if (!rate.allowed) {
        // Over the cap: revoke the guest we just made rather than leaving an
        // unmetered one behind. The caller gets a clean 429 and can retry, and
        // the rollback keeps rows and quota in agreement.
        await db.user.delete({ where: { id: userId } }).catch(() => undefined);
        return NextResponse.json(
          {
            error: "Too many guest sessions from this network. Please try again later.",
            retryAfterMinutes: retryAfterMinutes(60 * 60_000),
          },
          { status: 429, headers: { "Retry-After": String(retryAfterMinutes(60 * 60_000) * 60) } }
        );
      }
    }

    auditLog("user.guest_create", { userId, handle });

    const res = NextResponse.json({ ok: true, userId, handle, name, isAnonymous: true });
    for (const cookie of setCookies) {
      res.headers.append("set-cookie", cookie);
    }
    return res;
  } catch (error) {
    console.error("[GUEST_API] Failed to create guest session:", error);
    return NextResponse.json(
      { error: "We couldn't start your guest session. Please try again." },
      { status: 500 }
    );
  }
}

/** Whole minutes until the current fixed window rolls over. */
function retryAfterMinutes(windowMs: number): number {
  const now = Date.now();
  return Math.max(1, Math.ceil((Math.floor(now / windowMs) * windowMs + windowMs - now) / 60_000));
}

/**
 * Real client IP, falling back to a stable per-process bucket.
 *
 * On localhost there is no `x-forwarded-for` at all, so every request would
 * otherwise share the literal key "unknown" — and in dev that bucket is shared
 * by everything on the machine.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return process.env.NODE_ENV === "production" ? "unknown" : `dev:${process.pid}`;
}

/**
 * Max guest rows per IP per hour, or 0 to disable.
 *
 * Disabled outside production: on localhost the key is shared by every dev
 * process and the cap only ever gets in the way. In production the limit is
 * high enough to be invisible to a shared-IP user but low enough that a
 * scripted farm still runs out — and since the AI allowance (GUEST_AI_LIMIT)
 * is what actually costs money, this is a secondary guard, not the main one.
 */
function guestCreateLimit(): number {
  return process.env.NODE_ENV === "production" ? 50 : 0;
}
