"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ReportErrorProps = {
  /** Short label of what failed (e.g. "Schedule upload", "Profile photo upload"). */
  context: string;
  /** The error message shown to the user — pre-fills the report body. */
  errorMessage: string;
  /** Optional page path the user was on when the error happened. */
  page?: string;
  /** Optional extra detail (stack, request id, response code, etc.) — prepended to the body. */
  extraDetail?: string;
};

function buildBody({
  context,
  errorMessage,
  page,
  extraDetail,
}: {
  context: string;
  errorMessage: string;
  page?: string;
  extraDetail?: string;
}) {
  const parts: string[] = [];
  parts.push(`Where it happened: ${context}`);
  if (page) parts.push(`Page: ${page}`);
  if (typeof window !== "undefined") {
    parts.push(`Browser: ${navigator.userAgent}`);
  }
  parts.push("");
  parts.push("What I saw:");
  parts.push(errorMessage || "An error occurred.");
  if (extraDetail) {
    parts.push("");
    parts.push("Details:");
    parts.push(extraDetail);
  }
  return parts.join("\n");
}

async function sendReport({
  context,
  errorMessage,
  page,
  extraDetail,
}: ReportErrorProps): Promise<void> {
  const payload = {
    type: "bug",
    subject: `Error report: ${context}`,
    message: buildBody({ context, errorMessage, page, extraDetail }),
    page: page ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
  };

  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
}

/** One-click "Send report" button. Sends the report immediately on tap and
 *  shows a thank-you toast — no form to fill out. */
export function ReportErrorButton(props: ReportErrorProps & { className?: string }) {
  const { className, ...reportProps } = props;
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (sending) return;
    setSending(true);
    try {
      await sendReport(reportProps);
      toast.success("Thank you! Your report has been sent to the admin team.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send the report. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      disabled={sending}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-destructive underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {sending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Sending…
        </>
      ) : (
        <>
          <Flag className="h-3 w-3" />
          Send report
        </>
      )}
    </button>
  );
}

/** @deprecated Previously a form dialog. Now an alias for the one-click auto-send button. */
export function ReportErrorDialog({
  context,
  errorMessage,
  page,
  extraDetail,
}: ReportErrorProps) {
  return (
    <ReportErrorButton
      context={context}
      errorMessage={errorMessage}
      page={page}
      extraDetail={extraDetail}
    />
  );
}
