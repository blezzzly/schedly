"use client";

import { useEffect, useRef } from "react";

import { CalendarClock, Clock, MapPin, User } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { DAY_FULL } from "@/features/insights/compute-insights";
import {
  formatClockTime,
  formatTimeRange,
  fmtCountdown,
  toMin,
} from "@/features/dashboard/lib/class-time";
import type { ClassData } from "@/features/dashboard/lib/types";

type NextDayClass = { day: string; cls: ClassData } | null;

type TodayClassesCardProps = {
  // Today's classes, already filtered to the current weekday.
  classes: ClassData[];
  // Ticking clock — drives the ongoing/upcoming/finished sort and countdowns.
  now: Date;
  // True while schedules are still loading (shows skeletons).
  loading: boolean;
  // The first class on the next day that has one, shown in the footer.
  nextDay: NextDayClass;
};

// Dominant dashboard tile — the day's classes at a glance. On desktop it
// spans two rows beside the weather/free-time tiles; on mobile it stacks
// full-width above them (see .bento-grid in globals.css).
export function TodayClassesCard({ classes, now, loading, nextDay }: TodayClassesCardProps) {
  const todayListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll through the classes — one card every 2 seconds, looping back
  // to the first card after the last (1 → 2 → 3 → 4 → 1…). Always advances a
  // single card from the current scroll position so it stays in sync even
  // after a manual scroll. Pauses while the user hovers/touches the list so
  // it never fights their hand.
  useEffect(() => {
    if (classes.length < 2) return;
    const list = todayListRef.current;
    if (!list) return;

    let paused = false;

    const advance = () => {
      if (paused || list.children.length === 0) return;
      const cardHeight = list.clientHeight;
      if (cardHeight <= 0) return;
      const maxTop = list.scrollHeight - cardHeight;
      const nextTop = list.scrollTop + cardHeight;
      if (nextTop >= maxTop) {
        // Reached the last card — wrap back to the first.
        list.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        list.scrollTo({ top: nextTop, behavior: "smooth" });
      }
    };

    const id = setInterval(advance, 2000);
    const onEnter = () => (paused = true);
    const onLeave = () => (paused = false);

    list.addEventListener("pointerenter", onEnter);
    list.addEventListener("pointerleave", onLeave);

    return () => {
      clearInterval(id);
      list.removeEventListener("pointerenter", onEnter);
      list.removeEventListener("pointerleave", onLeave);
    };
  }, [classes.length]);

  // Ongoing first, upcoming next, finished pushed to the bottom — each group
  // ordered by start time.
  const sorted = [...classes].sort((a, b) => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rank = (c: ClassData) => {
      const startMin = toMin(c.startTime);
      const endMin = toMin(c.endTime);
      if (nowMin >= startMin && nowMin < endMin) return 0;
      if (nowMin < startMin) return 1;
      return 2;
    };
    return rank(a) - rank(b) || toMin(a.startTime) - toMin(b.startTime);
  });

  return (
    <Card className="bento-tile-main flex h-full w-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          Today&apos;s Classes
        </CardTitle>
        <div className="flex items-center gap-2">
          {classes.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-primary">
              {classes.length} today
            </span>
          )}
          <CalendarClock className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <BoneSkeleton
          name="dashboard-today-classes"
          loading={loading}
          className="flex min-h-0 flex-1 flex-col"
          fallback={
            // Skeleton mirrors the real card: one class-card over the next-day
            // footer block (the footer renders in both states below).
            <div className="my-auto flex flex-col">
              <div className="flex h-32 flex-col rounded-xl border border-border/60 bg-muted/25 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="mt-3 h-3 w-20" />
              </div>
            </div>
          }
        >
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes today — time to relax or catch up on tasks.
            </p>
          ) : (
          // One compact subject visible at a time, snap-scroll through the rest.
          <div
            ref={todayListRef}
            className="my-auto h-32 snap-y snap-mandatory overflow-y-auto pr-1"
          >
            {sorted.map((c) => {
              const name = c.shortName?.trim() || c.code?.trim() || c.subject;
              const nowMin = now.getHours() * 60 + now.getMinutes();
              const startMin = toMin(c.startTime);
              const endMin = toMin(c.endTime);
              const finished = nowMin > endMin;
              const ongoing = !finished && nowMin >= startMin;
              return (
                <div
                  key={c.id}
                  className="flex h-full snap-start flex-col rounded-xl border border-primary/25 bg-primary/[0.04] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <p className="truncate text-[15px] font-semibold text-foreground">
                        {name}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                        ongoing
                          ? "bg-destructive/10 text-destructive"
                          : finished
                            ? "bg-foreground/10 text-muted-foreground"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      {ongoing ? "Ongoing" : finished ? "Finished" : "Upcoming"}
                    </span>
                  </div>

                  {/* Time labels stay intact ("8:35 PM – 9:30 PM" never splits);
                      room/instructor wrap as whole units when space runs out. */}
                  <div className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      {formatTimeRange(c.startTime, c.endTime)}
                    </span>
                    {c.room?.trim() && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" /> {c.room.trim()}
                      </span>
                    )}
                    {c.instructor?.trim() && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" /> {c.instructor.trim()}
                      </span>
                    )}
                  </div>

                  {ongoing && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary">
                      <Clock className="h-3 w-3 shrink-0" />
                      Happening now · ends in {fmtCountdown((endMin - nowMin) * 60000)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </BoneSkeleton>

        {nextDay && (
          <div className="mt-2 shrink-0 border-t border-border/60 pt-2">
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="h-3 w-3 shrink-0" />
              Upcoming · {DAY_FULL[nextDay.day]}
            </p>
            <div className="flex items-start justify-between gap-2 rounded-xl border border-border/40 p-3.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: nextDay.cls.color }}
                  />
                  <p className="truncate text-sm font-medium text-foreground">
                    {nextDay.cls.shortName?.trim() ||
                      nextDay.cls.code?.trim() ||
                      nextDay.cls.subject}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    {formatTimeRange(nextDay.cls.startTime, nextDay.cls.endTime)}
                  </span>
                  {nextDay.cls.room?.trim() && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" /> {nextDay.cls.room.trim()}
                    </span>
                  )}
                  {nextDay.cls.instructor?.trim() && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" /> {nextDay.cls.instructor.trim()}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-primary">
                {formatClockTime(nextDay.cls.startTime)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}