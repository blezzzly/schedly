import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import {
  sendPushNotification,
  TEST_PUSH_PAYLOAD,
} from "@/server/services/push-notification.service";

export const dynamic = "force-dynamic";

/** Send a test notification to the authenticated user's own devices. Users
 *  can never push to anyone but themselves. */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const result = await sendPushNotification(session.user.id, TEST_PUSH_PAYLOAD);
  if (result.devices === 0) {
    return NextResponse.json(
      { error: "NO_SUBSCRIPTIONS", message: "Enable notifications first." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, ...result });
}