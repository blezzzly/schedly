import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { checkRateLimitDb, validateCsrf } from "@/server/lib/security";
import { auditLog } from "@/server/lib/audit";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feedback", "question"]).default("feedback"),
  subject: z.string().max(200).optional(),
  message: z.string().min(1, "Message is required").max(5000),
  page: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await checkRateLimitDb(`feedback:${session.user.id}`, 5, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { type, subject, message, page } = parsed.data;

  try {
    const feedback = await db.feedback.create({
      data: {
        userId: session.user.id,
        email: session.user.email ?? null,
        type,
        subject: subject ?? null,
        message,
        page: page ?? null,
      },
    });

    auditLog("feedback.submit", { userId: session.user.id, feedbackId: feedback.id, type });

    return NextResponse.json({ success: true, id: feedback.id }, { status: 201 });
  } catch (err) {
    console.error("[FEEDBACK_API] Failed to save feedback:", err);
    return NextResponse.json(
      { error: "Failed to save feedback. Please try again." },
      { status: 500 }
    );
  }
}
