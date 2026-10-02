"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, BellRing, Check, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { authFetch } from "@/lib/auth-fetch";
import { isPushSupported, enablePush } from "@/lib/push";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

const REMINDER_OPTIONS = [
  { label: "5 min before", value: 5 },
  { label: "15 min before", value: 15 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "1 day before", value: 1440 },
];

const START_OPTIONS = [
  { label: "Today", value: "today", description: "Classes start now" },
  { label: "Next Week", value: "next_week", description: "Classes start on Monday" },
  { label: "Choose Date", value: "custom", description: "Pick a specific start date" },
];

export default function SaveOnboardingPage() {
  const router = useRouter();
  const { user, isLoading, refetchSession } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [startChoice, setStartChoice] = useState<string>("today");
  const [customDate, setCustomDate] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [notifStatus, setNotifStatus] = useState<"idle" | "loading" | "granted" | "denied">("idle");
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size={28} color="var(--primary)" />
      </div>
    );
  }

  const handleStartNext = () => setStep(2);
  const handleReminderNext = () => setStep(3);

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("Notifications are not supported in this browser.");
      return;
    }
    if (Notification.permission === "granted") {
      setNotifStatus("granted");
      return;
    }
    setNotifStatus("loading");
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        if (isPushSupported()) {
          await enablePush().catch(() => {});
        }
        setNotifStatus("granted");
      } else {
        setNotifStatus("denied");
      }
    } catch {
      setNotifStatus("denied");
    }
  };

  const handleGoToDashboard = async () => {
    setFinishing(true);

    let startDate: string;
    if (startChoice === "today") {
      startDate = new Date().toISOString().split("T")[0]!;
    } else if (startChoice === "next_week") {
      const nextMonday = getNextMonday();
      startDate = nextMonday.toISOString().split("T")[0]!;
    } else {
      startDate = customDate || new Date().toISOString().split("T")[0]!;
    }

    try {
      await authClient.updateUser({
        defaultReminderMinutes: reminderMinutes,
        reminderStartDate: startDate,
        onboardingCompleted: true,
        ...(notifStatus === "granted" ? { notificationsEnabled: true } : {}),
      } as Parameters<typeof authClient.updateUser>[0]);
    } catch {
      // non-fatal
    }

    await refetchSession({ query: { disableCookieCache: true } });

    try {
      const res = await authFetch("/api/auth/get-session?disableCookieCache=true");
      const data = await res.json();
      const updated = data?.user as { onboardingCompleted?: boolean } | null | undefined;
      if (updated?.onboardingCompleted) {
        router.push("/dashboard");
        return;
      }
    } catch {
      // non-fatal
    }

    router.push("/dashboard");
  };

  const handleSkip = async () => {
    setFinishing(true);

    try {
      await authClient.updateUser({
        onboardingCompleted: true,
      } as Parameters<typeof authClient.updateUser>[0]);
    } catch {
      // non-fatal
    }

    await refetchSession({ query: { disableCookieCache: true } });

    try {
      const res = await authFetch("/api/auth/get-session?disableCookieCache=true");
      const data = await res.json();
      const updated = data?.user as { onboardingCompleted?: boolean } | null | undefined;
      if (updated?.onboardingCompleted) {
        router.push("/dashboard");
        return;
      }
    } catch {
      // non-fatal
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center p-5">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s === step ? "bg-primary" : s < step ? "bg-primary/40" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* ── STEP 1: When do your classes start? ── */}
        {step === 1 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-8">
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  When do your classes start?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  This helps us set up your reminders and live updates.
                </p>
              </div>

              <div className="space-y-2.5">
                {START_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStartChoice(opt.value)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-all ${
                      startChoice === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/70 hover:bg-muted/50"
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      startChoice === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    }`}>
                      {startChoice === opt.value && <Check className="h-3 w-3" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {startChoice === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              )}

              <div className="mt-6 flex gap-2.5">
                <Button variant="outline" className="flex-1 h-12" onClick={handleSkip}>
                  Skip
                </Button>
                <Button className="flex-[1.4] h-12 font-semibold" onClick={handleStartNext}>
                  Next
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Reminder time ── */}
        {step === 2 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-8">
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <BellRing className="h-5 w-5 text-primary" />
                </span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  When should we remind you?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose how early you want to be reminded before each class.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {REMINDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReminderMinutes(opt.value)}
                    className={`rounded-xl border-2 p-4 text-center transition-all ${
                      reminderMinutes === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/70 hover:bg-muted/50"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${
                      reminderMinutes === opt.value ? "text-primary" : "text-foreground"
                    }`}>
                      {opt.label}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1 h-12"
                  onClick={() => setStep(1)}
                >
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-[1.4] h-12 font-semibold"
                  onClick={handleReminderNext}
                >
                  Next
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: Notification permission ── */}
        {step === 3 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-8">
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <BellRing className="h-5 w-5 text-primary" />
                </span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Enable reminders?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Allow Schedly to send you notifications before each class.
                </p>
              </div>

              {notifStatus === "granted" ? (
                <div className="flex items-center gap-3 rounded-xl border-2 border-green-500 bg-green-200 p-4 dark:border-green-700 dark:bg-green-900/70">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/25">
                    <Check className="h-5 w-5 text-green-700 dark:text-green-300" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                      Notifications enabled
                    </p>
                    <p className="text-xs text-green-800 dark:text-green-200">
                      You&apos;ll get reminders {formatMinutes(reminderMinutes)} each class.
                    </p>
                  </div>
                </div>
              ) : notifStatus === "denied" ? (
                <div className="flex items-center gap-3 rounded-xl border border-border p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <BellRing className="h-5 w-5 text-muted-foreground" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Notifications blocked</p>
                    <p className="text-xs text-muted-foreground">
                      Enable them in your browser settings to get reminders.
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-12 text-sm font-semibold"
                  onClick={handleEnableNotifications}
                  disabled={notifStatus === "loading"}
                >
                  {notifStatus === "loading" ? (
                    "Asking..."
                  ) : (
                    <>
                      <BellRing className="mr-2 h-4 w-4" />
                      Enable Reminders
                    </>
                  )}
                </Button>
              )}

              <div className="mt-6 flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1 h-12"
                  onClick={() => setStep(2)}
                >
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-[1.4] h-12 font-semibold"
                  onClick={handleGoToDashboard}
                  disabled={finishing}
                >
                  {finishing ? "Saving..." : "Go to Dashboard"}
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function getNextMonday(): Date {
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  return nextMonday;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 1440) return "1 day before";
  if (minutes >= 60) return `${minutes / 60} hour${minutes >= 120 ? "s" : ""} before`;
  return `${minutes} minutes before`;
}
