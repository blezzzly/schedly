"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

type ClassData = {
  id: string;
  subject: string;
  shortName: string | null;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  block: string | null;
  notes: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
};

type Props = {
  classes: ClassData[];
  filename?: string;
  scale?: number;
  capture?: boolean;
  /** Render without the outer box chrome (border/bg/shadow/dots) — for when
   *  the preview sits inside its own card (dashboard "Your Schedule"). */
  bare?: boolean;
  /** Optional element rendered on the right side of the top bar (non-capture). */
  action?: React.ReactNode;
};

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const DAY_FULL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function classLabel(c: ClassData): string {
  return c.shortName?.trim() || c.code?.trim() || c.subject;
}

function timeToMinutes(t: Date): number {
  const d = new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function minutesTo12h(m: number): string {
  const totalH = Math.floor(m / 60);
  let h = totalH % 12;
  if (h === 0) h = 12;
  const m2 = m % 60;
  const ampm = totalH < 12 ? "AM" : "PM";
  return `${h}:${String(m2).padStart(2, "0")} ${ampm}`;
}

function formatTimeRange(start: Date, end: Date): string {
  return `${minutesTo12h(timeToMinutes(start))} – ${minutesTo12h(timeToMinutes(end))}`;
}

export function SchedulePreview({ classes, filename = "schedule.png", scale, capture, bare, action }: Props) {
  const activeDays = ALL_DAYS.filter((day) => classes.some((c) => c.days.includes(day)));
  const [selected, setSelected] = useState<ClassData | null>(null);

  if (activeDays.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No classes scheduled
      </div>
    );
  }

  const slots = Array.from(
    new Set(classes.map((c) => timeToMinutes(c.startTime)))
  ).sort((a, b) => a - b);

  const classesAt = (day: string, slot: number) =>
    classes.filter(
      (c) =>
        c.days.includes(day as ClassData["days"][number]) &&
        timeToMinutes(c.startTime) === slot
    );

  const isCapture = capture;

  return (
    <div
      className={
        isCapture
          ? "w-full rounded-xl border border-border/60 bg-card p-8"
          : bare
            ? "w-full"
            : "mx-auto w-full max-w-2xl rounded-xl border border-border/60 bg-card p-3 shadow-2xl shadow-primary/5 sm:p-5"
      }
      style={
        isCapture
          ? { width: "1200px", fontFamily: "inherit" }
          : scale
          ? { zoom: scale }
          : undefined
      }
    >
      {bare ? (
        action ? (
          <div className="mb-3 flex items-center justify-end">{action}</div>
        ) : null
      ) : (
        <div className="mb-3 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-destructive/60" />
          <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
          <div className="h-3 w-3 rounded-full bg-green-400/60" />
          <span className="ml-2 min-w-0 flex-1 truncate text-xs font-mono text-muted-foreground">{filename}</span>
          {!isCapture && action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}

      {/* The non-capture timetable fills its container so the whole week is
          always visible without horizontal scrolling — columns shrink evenly
          on small screens. The capture render keeps a fixed wide size for
          the off-screen image export. */}
      <div className="overflow-hidden">
        <div
          className={isCapture ? "grid min-w-[760px] gap-3" : "grid gap-1"}
          style={{ gridTemplateColumns: `repeat(${activeDays.length}, minmax(0, 1fr))` }}
        >
          {activeDays.map((day) => (
            <div
              key={day}
              className={
                isCapture
                  ? "rounded-lg bg-primary/10 p-4 text-center text-2xl font-semibold text-primary"
                  : "rounded-md bg-primary/10 p-1.5 text-center text-[11px] font-semibold text-primary sm:p-1.5 sm:text-xs"
              }
            >
              {DAY_LABELS[day]}
            </div>
          ))}

          {slots.map((slot) =>
            activeDays.map((day) => {
              const items = classesAt(day, slot);
              return (
                <div key={`${slot}-${day}`} className={isCapture ? "min-h-[120px]" : "min-h-[44px]"}>
                  {items.length === 0 ? (
                    <div className={isCapture ? "flex h-full min-h-[120px] items-center justify-center rounded-lg bg-muted/30" : "flex h-full min-h-[44px] items-center justify-center rounded-md bg-muted/30"} />
                  ) : (
                    <div className={isCapture ? "flex flex-col gap-3" : "flex flex-col gap-1"}>
                      {items.map((c) => {
                        const tooltip = !isCapture
                          ? [
                              c.subject,
                              c.code && `Code: ${c.code}`,
                              c.instructor && `Instructor: ${c.instructor}`,
                              c.room && `Room: ${c.room}`,
                              formatTimeRange(c.startTime, c.endTime),
                            ]
                              .filter(Boolean)
                              .join("\n")
                          : undefined;

                        const cell = (
                          <div
                            className={isCapture ? "rounded-lg p-4 text-center" : "rounded-md p-1 text-center"}
                            style={{ backgroundColor: c.color + "1f", color: c.color }}
                          >
                            <div className={isCapture ? "text-2xl font-semibold leading-tight break-words" : "text-[10px] font-semibold leading-tight break-words sm:text-[10px]"}>
                              {classLabel(c)}
                            </div>
                            <div className={isCapture ? "text-lg opacity-80 leading-tight" : "mt-0.5 text-[9px] opacity-80 leading-tight"}>
                              {minutesTo12h(timeToMinutes(c.startTime))}–
                              {minutesTo12h(timeToMinutes(c.endTime))}
                            </div>
                          </div>
                        );

                        if (isCapture) {
                          return <div key={c.id} title={tooltip}>{cell}</div>;
                        }

                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelected(c)}
                            title={tooltip}
                            aria-label={`${classLabel(c)} details`}
                            className="block w-full cursor-pointer rounded-md text-left outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
                          >
                            {cell}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ClassInfoCard cls={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ClassInfoCard({ cls, onClose }: { cls: ClassData | null; onClose: () => void }) {
  if (!cls) return null;

  const details: Array<{ label: string; value: string }> = [
    { label: "Subject", value: cls.subject },
    { label: "Room", value: cls.room ?? "" },
    { label: "Section", value: cls.section ?? "" },
    { label: "Days", value: cls.days.map((d) => DAY_FULL[d]).join(", ") },
    { label: "Time", value: formatTimeRange(cls.startTime, cls.endTime) },
  ].filter((d) => d.value.trim() !== "");

  return (
      <Dialog open={cls !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm overflow-hidden p-0 sm:max-w-md">
          {/* MD3-style info card */}
          <div className="flex flex-col">
            <div
              className="flex items-start gap-3 px-5 pt-5"
              style={{ color: cls.color }}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
                style={{ backgroundColor: cls.color + "1f", color: cls.color }}
              >
                {(classLabel(cls)[0] ?? "?").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold leading-tight text-foreground break-words">
                  {classLabel(cls)}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground break-words">
                  {cls.subject}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-0 px-5 pb-5">
              {details.map((d, i) => (
                <div
                  key={d.label}
                  className={`flex items-start justify-between gap-4 py-3 ${
                    i === 0 ? "" : "border-t border-border/60"
                  }`}
                >
                  <span className="shrink-0 text-sm font-medium text-muted-foreground">
                    {d.label}
                  </span>
                  <span className="max-w-[60%] text-right text-sm font-medium text-foreground break-words">
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}
