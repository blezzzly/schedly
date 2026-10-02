"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ClipboardPaste, Download, GraduationCap, Share2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { Button } from "@/components/ui/button";
import { openQuickAdd } from "@/lib/quick-add-sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { SchedulePreview } from "@/features/schedule/components/schedule-preview";
import { ScheduleShareDialog, ScheduleImportDialog } from "@/features/schedule/components/schedule-share-dialog";
import { EditScheduleDialog } from "@/features/dashboard/components/edit-schedule-dialog";
import type { ClassData, ScheduleData } from "@/features/dashboard/lib/types";

type ScheduleSectionProps = {
  schedules: ScheduleData[] | null;
  activeClasses: ClassData[];
  activeSchedule: ScheduleData | null;
  scheduleCount: number;
  idx: number;
  downloading: boolean;
  onDownload: () => void;
  onEdited?: () => void;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  scheduleRef: React.RefObject<HTMLDivElement | null>;
  captureRef: React.RefObject<HTMLDivElement | null>;
  /** Refetch the schedules after a share-code import adds a new one. */
  onRefresh?: () => void;
};

// Full-width timetable below the bento grid. If the user has several
// schedules, left/right arrows flip between them; a hidden off-screen render
// powers the "Download image" export.
export function ScheduleSection({
  schedules,
  activeClasses,
  activeSchedule,
  scheduleCount,
  idx,
  downloading,
  onDownload,
  onEdited,
  setActiveIndex,
  scheduleRef,
  captureRef,
  onRefresh,
}: ScheduleSectionProps) {
  const [shareOpen, setShareOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  return (
    <section>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Your Schedule</CardTitle>
          {schedules && schedules.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-primary">
              {scheduleCount} schedule{scheduleCount !== 1 ? "s" : ""}
            </span>
          )}
        </CardHeader>
        <CardContent>
        <BoneSkeleton
          name="dashboard-schedule"
          loading={schedules === null}
          fallback={
            // Skeleton mirrors the timetable card: window dots + filename + action
            // button on top, then the 7-column day header and class cells.
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="ml-2 h-3 w-32" />
                <Skeleton className="ml-auto h-8 w-32 rounded-lg" />
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={`h-${i}`} className="h-10 w-full" />
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 21 }).map((_, i) => (
                  <Skeleton key={`c-${i}`} className="h-14 w-full" />
                ))}
              </div>
            </div>
          }
        >
      {schedules && schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No schedule yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Upload a photo of your class schedule and your timetable will appear here
            automatically.
          </p>
          <Button className="mt-5" onClick={openQuickAdd}>
            Upload Schedule
          </Button>
        </div>
      ) : (
        <>
          {/* Schedule controls live OUTSIDE the captured node so the
              downloaded image is exactly the timetable the user sees. */}
          <div className="mb-3 flex items-center justify-end gap-1.5">
            {scheduleCount > 1 && (
              <div className="flex shrink-0 items-center rounded-full border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  aria-label="Previous schedule"
                  disabled={idx <= 0}
                  onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="max-w-[90px] truncate px-1 text-[11px] font-medium text-foreground sm:max-w-[140px]">
                  {activeSchedule?.title?.trim() || `Schedule ${idx + 1}`}
                </span>
                <span className="pl-0.5 pr-1 text-[10px] text-muted-foreground">
                  {idx + 1}/{scheduleCount}
                </span>
                <button
                  type="button"
                  aria-label="Next schedule"
                  disabled={idx >= scheduleCount - 1}
                  onClick={() => setActiveIndex((i) => Math.min(scheduleCount - 1, i + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {/* Import first — it's how a shared timetable arrives, so it leads.
                Share, download and edit all act on the schedule you're looking
                at, which is why they sit to its right. All four live outside the
                captured node so the downloaded image stays exactly the
                timetable. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="shrink-0"
            >
              <ClipboardPaste className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Enter code</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="shrink-0"
            >
              <Share2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onDownload} disabled={downloading} className="shrink-0">
              {downloading ? (
                <>
                  <Spinner size={16} color="var(--foreground)" className="sm:mr-2" />{" "}
                  <span className="hidden sm:inline"> Saving...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 sm:mr-2" />{" "}
                  <span className="hidden sm:inline">Download image</span>
                </>
              )}
            </Button>
            {activeSchedule && (
              <EditScheduleDialog
                scheduleId={activeSchedule.id}
                classes={activeClasses}
                onSaved={onEdited}
              />
            )}
          </div>
          <div ref={scheduleRef}>
            <SchedulePreview classes={activeClasses} filename="schedule.png" bare />
          </div>
        </>
      )}
        </BoneSkeleton>
        </CardContent>
      </Card>

      <div
        ref={captureRef}
        aria-hidden
        style={{
          position: "fixed",
          left: "-99999px",
          top: 0,
          pointerEvents: "none",
          opacity: 1,
        }}
      >
        <SchedulePreview classes={activeClasses} filename="schedule.png" capture />
      </div>

      <ScheduleShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        scheduleId={activeSchedule?.id ?? null}
        scheduleTitle={activeSchedule?.title?.trim() || "this schedule"}
      />
      <ScheduleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={onRefresh}
      />
    </section>
  );
}