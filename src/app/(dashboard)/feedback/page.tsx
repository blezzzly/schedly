"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FloatingLabelTextarea } from "@/components/ui/floating-label-textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeBuoy, Send, CheckCircle, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { authFetch } from "@/lib/auth-fetch";
import { HeaderBack } from "@/components/header-back";
import { NotificationBell } from "@/components/notification-bell";

const TYPE_OPTIONS = [
  { value: "bug", label: "Report an issue" },
  { value: "feedback", label: "Feedback / suggestion" },
  { value: "question", label: "Question" },
];

const PAGE_OPTIONS = [
  { value: "", label: "General" },
  { value: "Schedule Upload", label: "Schedule Upload" },
  { value: "To-Do", label: "To-Do List" },
  { value: "Reminders", label: "Reminders" },
  { value: "GWA Calculator", label: "GWA Calculator" },
  { value: "Notifications", label: "Notifications" },
];

export default function FeedbackPage() {
  const [type, setType] = useState("bug");
  const [page, setPage] = useState("Schedule Upload");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError("Please describe your issue or feedback.");
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-protection": "1" },
        body: JSON.stringify({
          type,
          subject: subject.trim() || undefined,
          message: message.trim(),
          page: page || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setDone(true);
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-green-200 bg-green-50 px-6 py-16 text-center dark:border-green-800 dark:bg-green-950">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900">
          <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
          Sent! Thank you.
        </h3>
        <p className="mt-1 max-w-xs text-sm text-green-700 dark:text-green-300">
          We&apos;ve received your message and will look into it.
        </p>
        <Button className="mt-5" onClick={() => setDone(false)}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/settings?tab=support" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Help &amp; Feedback
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Having trouble uploading your schedule? Tell us what happened.
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy className="h-5 w-5 text-primary" />
            Share your issue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="page">Where did this happen?</Label>
                <select
                  id="page"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {PAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <TextField
              label="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
            />

            <FloatingLabelTextarea
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={5000}
            />

            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Spinner size={16} color="var(--primary-foreground)" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
