import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { resolveLiveUserId } from "@/server/lib/live-user";
import { savePushSubscription, validateSubscriptionInput } from "@/server/services/push-notification.service";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // See src/server/lib/live-user.ts — a cached session can outlive its user
  // row, and writing with that id would fail the FK constraint.
  const userId = await resolveLiveUserId(session.user.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const input = validateSubscriptionInput(body);
  if (!input) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await savePushSubscription(userId, input);
  return NextResponse.json({ ok: true });
}