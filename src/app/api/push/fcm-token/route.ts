import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { resolveLiveUserId } from "@/server/lib/live-user";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // See src/server/lib/live-user.ts — a cached session can outlive its user
  // row, and the upsert below would fail the FK constraint.
  const userId = await resolveLiveUserId(session.user.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await (tx as typeof db).fCMToken.upsert({
      where: { token },
      create: { userId, token },
      update: { updatedAt: new Date() },
    });

    // Keep the user's timezone in sync with this device (the model defaults
    // to UTC, which would shift every reminder by the UTC offset).
    const timezone = typeof body?.timezone === "string" ? body.timezone.slice(0, 64) : "UTC";
    if (timezone !== "UTC") {
      await (tx as typeof db).user.updateMany({
        where: { id: userId },
        data: { timezone },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token) {
    await db.fCMToken.deleteMany({ where: { token, userId: session.user.id } });
  } else {
    // No token sent — drop every FCM token for this user (signed-out cleanup).
    await db.fCMToken.deleteMany({ where: { userId: session.user.id } });
  }
  return NextResponse.json({ ok: true });
}