"use client";

import {
  Flame,
  Feather,
  CalendarOff,
  Coffee,
  AlertTriangle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ScheduleInsights,
  minutesToHoursLabel,
  formatClock,
  DAY_FULL,
  DAY_SHORT,
} from "./compute-insights";

const PACKED_WEEK_THRESHOLD_PCT = 60;

function InsightCard({
  icon: Icon,
  label,
  children,
  accent = "text-primary",
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  accent?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card className="border-border/50 [--card-spacing:--spacing(5)]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${tone === "warning" ? "text-amber-500" : accent}`} />
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

/** Answers: "Which day should I NOT add plans to?" */
function HeaviestDayCard({ insights }: { insights: ScheduleInsights }) {
  if (!insights.busiestDay) return null;
  return (
    <InsightCard icon={Flame} label="Heaviest Day" accent="text-orange-500">
      <p className="text-lg font-bold tracking-tight text-foreground">
        {DAY_FULL[insights.busiestDay.day] ?? insights.busiestDay.day}
      </p>
      <p className="text-xs text-muted-foreground">
        {minutesToHoursLabel(insights.busiestDay.busyMinutes)} booked — try to keep this day free of extra plans.
      </p>
    </InsightCard>
  );
}

/** Answers: "When is the best time to schedule errands or appointments?" */
function LightestDayCard({ insights }: { insights: ScheduleInsights }) {
  if (!insights.lightestDay) return null;
  return (
    <InsightCard icon={Feather} label="Best Day for Plans" accent="text-sky-500">
      <p className="text-lg font-bold tracking-tight text-foreground">
        {DAY_FULL[insights.lightestDay.day] ?? insights.lightestDay.day}
      </p>
      <p className="text-xs text-muted-foreground">
        Only {minutesToHoursLabel(insights.lightestDay.busyMinutes)} booked — schedule errands, appointments, or study time here.
      </p>
    </InsightCard>
  );
}

/** Answers: "Which days are completely open?" */
function FreeDaysCard({ insights }: { insights: ScheduleInsights }) {
  if (insights.fullyFreeDays.length === 0) return null;
  return (
    <InsightCard icon={CalendarOff} label="Completely Free" accent="text-emerald-500">
      <p className="text-lg font-bold tracking-tight text-foreground">
        {insights.fullyFreeDays.map((d) => DAY_SHORT[d] ?? d).join(", ")}
      </p>
      <p className="text-xs text-muted-foreground">
        No commitments — a good day to rest or work on personal projects.
      </p>
    </InsightCard>
  );
}

/** Answers: "Is there a repeatable window I can build a routine around?" */
function RoutineWindowsCard({ insights }: { insights: ScheduleInsights }) {
  if (insights.recurringFree.length === 0) return null;
  return (
    <Card className="border-border/50 [--card-spacing:--spacing(5)]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          Build a Routine
        </CardTitle>
        <Coffee className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.recurringFree.slice(0, 3).map((r, i) => {
          const days = r.days.map((d) => DAY_SHORT[d] ?? d).join(", ");
          return (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-primary/5 px-2.5 py-2">
              <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs leading-snug text-foreground">
                <span className="font-semibold">
                  {minutesToHoursLabel(r.endMinutes - r.startMinutes)} free
                </span>{" "}
                every {days} ({formatClock(r.startMinutes)} – {formatClock(r.endMinutes)}) — reserve it for a recurring habit.
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Answers: "Am I overcommitting this week?" — shown only when utilization is high. */
function PackedWeekCard({ insights }: { insights: ScheduleInsights }) {
  if (insights.weeklyUtilizationPct < PACKED_WEEK_THRESHOLD_PCT) return null;
  return (
    <InsightCard icon={AlertTriangle} label="Week Looks Packed" tone="warning">
      <p className="text-lg font-bold tracking-tight text-foreground">
        {insights.weeklyUtilizationPct}% booked
      </p>
      <p className="text-xs text-muted-foreground">
        Your week is heavily scheduled — consider rescheduling or dropping one thing to keep breathing room.
      </p>
    </InsightCard>
  );
}

export function ScheduleInsightsCards({
  insights,
  action,
}: {
  insights: ScheduleInsights;
  action?: React.ReactNode;
}) {
  const hasActionable =
    Boolean(insights.busiestDay) ||
    Boolean(insights.lightestDay) ||
    insights.fullyFreeDays.length > 0 ||
    insights.recurringFree.length > 0 ||
    insights.weeklyUtilizationPct >= PACKED_WEEK_THRESHOLD_PCT;

  if (!hasActionable) return null;

  return (
    <section aria-label="Schedule insights">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Insights</h2>
        </div>
        {action}
      </div>
      {/* Five cards hard-wired to two columns stranded the 5th on its own row and
          stretched each card across ~560px of desktop width to hold one short
          line of text. `md:grid-cols-3` gives tablets a middle step and puts
          the row to work on a desktop. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <HeaviestDayCard insights={insights} />
        <LightestDayCard insights={insights} />
        <FreeDaysCard insights={insights} />
        <RoutineWindowsCard insights={insights} />
        <PackedWeekCard insights={insights} />
      </div>
    </section>
  );
}
