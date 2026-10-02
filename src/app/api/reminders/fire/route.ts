import { NextResponse } from "next/server";
import {
  verifyQstashRequest,
  sendClassReminderPush,
} from "@/server/services/qstash-reminder.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// QStash delivers an exact-time HTTP request here for each scheduled class
// reminder. Always returns 200 so QStash doesn't retry a no-op; idempotency
// is enforced server-side via reminders.lastSentAt / lastStartSentAt.
export async function POST(req: Request) {
  const raw = await req.text();
  const valid = await verifyQstashRequest(req, raw);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (JSON.parse(raw || "{}") || {}) as {
      reminderId?: string;
      occ?: number;
      kind?: "pre" | "start";
      fireAt?: number;
    };
    if (!body.reminderId) {
      return NextResponse.json({ ok: true });
    }
    if (typeof body.occ === "number") {
      const result = await sendClassReminderPush({
        reminderId: body.reminderId,
        occ: body.occ,
        kind: body.kind ?? "pre",
      });
      return NextResponse.json({ ok: true, ...result });
    }
    // Legacy messages (scheduled before the two-message rollout) only carry
    // fireAt = [start - minutesBefore]; treat them as the upcoming push.
    if (typeof body.fireAt === "number") {
      const result = await sendClassReminderPush({
        reminderId: body.reminderId,
        occ: body.fireAt + 15 * 60 * 1000,
        kind: "pre",
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[REMINDER_FIRE]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}