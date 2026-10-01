import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { resolveLiveUserId } from "@/server/lib/live-user";
import {
  savePushSubscription,
  deletePushSubscription,
  validateSubscriptionInput,
} from "@/server/services/push-notification.service";

export const dynamic = "force-dynamic";

/** Register the browser's push subscription (created via pushManager.
 *  subscribe with the Schedly VAPID public key) for the authenticated user.
 *  The userId always comes from the session — never from the request body. */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // A cached session can outlive its user row; writing with that id would fail
  // the push_subscriptions_user_id_fkey and surface as an opaque 500.
  const userId = await resolveLiveUserId(session.user.id);
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const input = validateSubscriptionInput(body);
  if (!input) {
    return NextResponse.json({ error: "INVALID_SUBSCRIPTION" }, { status: 400 });
  }

  await savePushSubscription(userId, input);
  return NextResponse.json({ ok: true });
}

/** Remove a device subscription (the browser already unsubscribed locally).
 *  The endpoint in the body targets one device; omitted, it clears all of the
 *  user's subscriptions (signed-out cleanup). */
export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint =
    body && typeof (body as Record<string, unknown>).endpoint === "string"
      ? ((body as Record<string, unknown>).endpoint as string).slice(0, 1000)
      : undefined;

  await deletePushSubscription(session.user.id, endpoint);
  return NextResponse.json({ ok: true });
}