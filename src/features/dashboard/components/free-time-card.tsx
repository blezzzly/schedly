"use client";

import { Coffee } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import {
  formatClock,
  getFreeTimeToday,
  minutesToHoursLabel,
  type FreePeriod,
} from "@/features/insights/compute-insights";

type FreeTimeCardProps = {
  // True while schedules are still loading (shows skeletons).
  loading: boolean;
  freeToday: ReturnType<typeof getFreeTimeToday> | null;
  longestBreak: FreePeriod | null;
};

// Dashboard side tile (right column on desktop, stacked on mobile) — the
// answer to "when can I study / rest?".
export function FreeTimeCard({ loading, freeToday, longestBreak }: FreeTimeCardProps) {
  return (
    <Card className="bento-tile-side">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="truncate text-base">
          {/* "Free Time Today" can't fit a 320px half-tile header, so narrow
              screens get the shorter label instead of a wrapped title. */}
          <span className="hidden min-[360px]:inline">Free Time Today</span>
          <span className="min-[360px]:hidden">Free Time</span>
        </CardTitle>
        <Coffee className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <BoneSkeleton
          name="dashboard-free-time"
          loading={loading}
          fallback={
            // Skeleton mirrors the real highlight: big duration number with the
            // longest-break label — same wrap/rows as the loaded state so the
            // tile keeps its height once the data arrives.
            <div className="flex flex-wrap items-end gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-5 w-28" />
            </div>
          }
        >
          {freeToday?.isFullyFree ? (
          <div>
            <p className="text-sm font-semibold text-foreground">You&apos;re free today</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              No schedule today — perfect time to relax or catch up on tasks.
            </p>
          </div>
        ) : longestBreak ? (
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {minutesToHoursLabel(longestBreak.durationMinutes)}
            </span>
            <span className="pb-1 text-xs text-muted-foreground">
              longest break · {formatClock(longestBreak.startMinutes)} –{" "}
              {formatClock(longestBreak.endMinutes)}
            </span>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-foreground">No long breaks today</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Packed day — squeeze in short breaks between classes.
            </p>
          </div>
        )}
        </BoneSkeleton>
      </CardContent>
    </Card>
  );
}