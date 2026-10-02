import { NextRequest, NextResponse } from "next/server";
import { dispatchDueReminders } from "@/server/services/reminder-dispatcher.service";
import { dispatchTodoDeadlines } from "@/server/services/todo-deadline-reminder.service";
import { scheduleQstashReminders } from "@/server/services/qstash-reminder.service";
import { auditLog, type AuditAction } from "@/server/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Each step runs isolated so one transient failure never fails the whole
  // cron (which would trip the GitHub Actions watchdog / Vercel Cron). Failures
  // are logged and reported in the response instead of 500-ing everything.
  const reminders = await runStep("reminders.cron", () => dispatchDueReminders());
  const todos = await runStep("reminders.todos", () => dispatchTodoDeadlines());
  const qstash = await runStep("reminders.qstash", () => scheduleQstashReminders());

  return NextResponse.json({ ok: true, reminders, todos, qstash });
}

async function runStep(name: AuditAction, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    auditLog(name, result as Record<string, unknown>);
    return result;
  } catch (err) {
    console.error(`[CRON_REMINDERS] ${name} failed:`, err);
    return { error: "step failed" };
  }
}