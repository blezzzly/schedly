"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

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
  days: DayKey[];
};

export type CalendarSchedule = {
  id: string;
  title: string;
  classes: ClassData[];
};

type DayOccurrence = { cls: ClassData; scheduleTitle: string | null };

const DAY_KEYS: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CELLS = 42;

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
  return `${minutesTo12h(timeToMinutes(start))} – ${minutesTo12h(
    timeToMinutes(end)
  )}`;
}

function classLabel(c: ClassData): string {
  return c.shortName?.trim() || c.code?.trim() || c.subject;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  );
}

function friendlyDayLabel(d: Date, today: Date): string {
  if (isSameDay(d, today)) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return `${DAY_FULL[d.getDay()]}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

type Props = {
  schedules: CalendarSchedule[];
  activeScheduleId: string | null;
  onActiveChange: (id: string | null) => void;
  onDeleteSchedule: (id: string) => void;
  onViewSchedule: (id: string) => void;
};

export function ScheduleCalendar({
  schedules,
  activeScheduleId,
  onActiveChange,
  onDeleteSchedule,
  onViewSchedule,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selected, setSelected] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );

  const activeSchedules = useMemo(
    () =>
      activeScheduleId
        ? schedules.filter((s) => s.id === activeScheduleId)
        : schedules,
    [schedules, activeScheduleId]
  );

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(
      first.getFullYear(),
      first.getMonth(),
      1 - first.getDay()
    );
    return Array.from(
      { length: CELLS },
      (_, i) =>
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    );
  }, [cursor]);

  const classesOn = useMemo(() => {
    const map = new Map<string, DayOccurrence[]>();
    for (const s of activeSchedules) {
      for (const cls of s.classes) {
        for (const day of cls.days) {
          const key = day as DayKey;
          const list = map.get(key) ?? [];
          list.push({
            cls,
            scheduleTitle: activeSchedules.length > 1 ? s.title : null,
          });
          map.set(key, list);
        }
      }
    }
    const seen = new Set<string>();
    const deduped = new Map<string, DayOccurrence[]>();
    for (const [day, list] of map) {
      const unique: DayOccurrence[] = [];
      for (const occ of list) {
        const occKey = `${occ.cls.subject.trim().toLowerCase()}|${timeToMinutes(occ.cls.startTime)}`;
        if (seen.has(day + "|" + occKey)) continue;
        seen.add(day + "|" + occKey);
        unique.push(occ);
      }
      deduped.set(day, unique);
    }
    return (d: Date) => deduped.get(DAY_KEYS[d.getDay()]!) ?? [];
  }, [activeSchedules]);

  const selectedDay = selected
    ? classesOn(selected).sort(
        (a, b) =>
          timeToMinutes(a.cls.startTime) - timeToMinutes(b.cls.startTime)
      )
    : [];

  const shiftMonth = (delta: number) =>
    setCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );

  return (
    <div className="space-y-3">
      {/* Schedule selector */}
      <div className="flex items-start gap-2 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => onActiveChange(null)}
          className={cn(
            "flex w-44 shrink-0 items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left transition-colors shadow-[3px_3px_0_0_#401f32]",
            activeScheduleId === null
              ? "border-foreground/70 bg-primary/5"
              : "border-foreground/70 bg-card hover:border-primary/40"
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              activeScheduleId === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              All schedules
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {schedules.length} saved ·{" "}
              {schedules.reduce((n, s) => n + s.classes.length, 0)} classes
            </span>
          </span>
        </button>

        {schedules.map((s) => {
          const chipActive = activeScheduleId === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                "flex w-52 shrink-0 items-center gap-1 rounded-2xl border-2 py-1 pl-2 pr-1 transition-colors shadow-[3px_3px_0_0_#401f32]",
                chipActive
                  ? "border-foreground/70 bg-primary/5"
                  : "border-foreground/70 bg-card hover:border-primary/40"
              )}
            >
              <button
                type="button"
                onClick={() => onActiveChange(s.id)}
                className="flex min-w-0 items-start gap-3 rounded-xl py-1.5 pl-1.5 pr-1 text-left"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    chipActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[110px] truncate text-sm font-semibold text-foreground">
                    {s.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {s.classes.length} class{s.classes.length !== 1 ? "es" : ""}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col gap-0.5 pr-1">
                <button
                  type="button"
                  onClick={() => onViewSchedule(s.id)}
                  aria-label={`View ${s.title} timetable`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Eye className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete "${s.title}"?`))
                      onDeleteSchedule(s.id);
                  }}
                  aria-label={`Delete ${s.title}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Calendar card */}
      <div className="rounded-2xl border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32]">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-full"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-full"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-base font-bold tracking-tight text-foreground">
            {MONTH_LABELS[cursor.getMonth()]}{" "}
            <span className="font-semibold text-muted-foreground">
              {cursor.getFullYear()}
            </span>
          </h2>
          {!isSameMonth(cursor, today) && (
            <Button
              variant="ghost"
              onClick={() =>
                setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
              }
              className="h-7 rounded-full px-2.5 text-xs font-semibold"
            >
              Today
            </Button>
          )}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1 px-2 pb-3 pt-1 sm:px-3 sm:pb-4">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-1 text-center text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {label}
            </div>
          ))}

          {cells.map((d) => {
            const occurrences = classesOn(d);
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, selected);
            const inMonth = isSameMonth(d, cursor);

            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelected(d)}
                aria-label={`${DAY_FULL[d.getDay()]}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}, ${occurrences.length} class${occurrences.length !== 1 ? "es" : ""}`}
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-xl transition-colors sm:h-13",
                  !inMonth && "opacity-25",
                  isSelected ? "bg-primary/10" : "hover:bg-muted/70",
                  isToday && !isSelected && "bg-secondary/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:text-[13px]",
                    isToday
                      ? "bg-primary font-bold text-primary-foreground"
                      : isSelected
                        ? "font-bold text-primary"
                        : "text-foreground"
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="mt-0.5 flex h-3.5 items-center">
                  {occurrences.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-1 text-[9px] font-semibold leading-tight text-primary">
                      {occurrences.length}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
      <div key={selected.toISOString()} className="animate-fade-up space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight text-foreground">
              {friendlyDayLabel(selected, today)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedDay.length === 0
                ? "Free day"
                : `${selectedDay.length} class${selectedDay.length !== 1 ? "es" : ""}`}
            </p>
          </div>
          {activeScheduleId && selectedDay.length > 0 && (
            <Button
              variant="outline"
              onClick={() => onViewSchedule(activeScheduleId)}
              className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold"
            >
              <Eye className="h-3.5 w-3.5" /> Timetable
            </Button>
          )}
        </div>

        {selectedDay.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              You&apos;re free this day
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A good day to relax or catch up on tasks.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedDay.map(({ cls, scheduleTitle }) => (
              <div
                key={cls.id}
                className="relative overflow-hidden rounded-xl border-2 border-foreground/70 bg-card px-4 py-3 shadow-[3px_3px_0_0_#401f32] transition-shadow hover:shadow-none"
              >
                <span
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: cls.color }}
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {classLabel(cls)}
                      </p>
                      {scheduleTitle && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {scheduleTitle}
                        </span>
                      )}
                    </div>
                    {(cls.room || cls.instructor) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {cls.room && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {cls.room}
                          </span>
                        )}
                        {cls.instructor && <span>{cls.instructor}</span>}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                    {formatTimeRange(cls.startTime, cls.endTime)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}