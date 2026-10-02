import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/lib/audit";
import type { NextRequest } from "next/server";

const { GET, POST: _POST } = toNextJsHandler(auth);

export { GET };

const LOCK_THRESHOLD = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const url = new URL(request.url);

  if (url.pathname.endsWith("/sign-in/email")) {
    try {
      const body = await request.clone().json();
      if (body?.email) {
        const user = await db.user.findUnique({
          where: { email: body.email },
          select: { id: true, lockedUntil: true },
        });

        if (user?.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          return Response.json(
            { error: "Account temporarily locked. Try again in 15 minutes." },
            { status: 423 }
          );
        }
      }
    } catch { /* passthrough */ }
  }

  const response = await _POST(request);

  if (url.pathname.endsWith("/sign-in/email")) {
    try {
      const body = await request.clone().json();
      if (body?.email) {
        const user = await db.user.findUnique({
          where: { email: body.email },
          select: { id: true, failedAttempts: true },
        });

        if (response.status === 401 && user) {
          const attempts = (user.failedAttempts || 0) + 1;
          const update =
            attempts >= LOCK_THRESHOLD
              ? {
                  failedAttempts: attempts,
                  lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
                }
              : { failedAttempts: attempts };

          await db.user.update({ where: { id: user.id }, data: update });
          auditLog("user.login", { email: body.email, success: false, attempts });
        } else if (response.status === 200 && user) {
          await db.user.update({
            where: { id: user.id },
            data: { failedAttempts: 0, lockedUntil: null },
          });
          auditLog("user.login", { email: body.email, success: true });
        }
      }
    } catch { /* passthrough */ }
  }

  return response;
}
