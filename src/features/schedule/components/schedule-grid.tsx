"use client";

import { Card } from "@/components/ui/card";

type ClassData = {
  id: string;
  subject: string;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
};

type Props = {
  classes: ClassData[];
  title?: string;
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

function timeToMinutes(t: Date): number {
  const d = new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function ScheduleGrid({ classes, title = "Your Schedule" }: Props) {
  const activeDays = ALL_DAYS.filter((day) => classes.some((c) => c.days.includes(day)));

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
      (c) => c.days.includes(day as ClassData["days"][number]) && timeToMinutes(c.startTime) === slot
    );

  return (
    <Card className="overflow-hidden">
      {title && <h2 className="border-b border-border/60 px-4 py-3 text-base font-semibold text-foreground">{title}</h2>}
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[560px]"
          style={{ gridTemplateColumns: `72px repeat(${activeDays.length}, minmax(0, 1fr))` }}
        >
            <div className="border-b border-r bg-muted/40 p-2 text-xs font-semibold text-muted-foreground">
              Time
            </div>
            {activeDays.map((day) => (
              <div
                key={day}
                className="border-b border-r bg-muted/40 p-2 text-center text-xs font-semibold text-muted-foreground last:border-r-0"
              >
                {DAY_LABELS[day]}
              </div>
            ))}

            {slots.map((slot) => (
              <div key={slot} className="contents">
                <div className="flex items-start justify-end border-b border-r border-border/60 bg-muted/20 p-2 text-xs font-medium text-muted-foreground">
                  {minutesToTime(slot)}
                </div>
                {activeDays.map((day) => {
                  const items = classesAt(day, slot);
                  return (
                    <div
                      key={day}
                      className="min-h-[56px] border-b border-r border-border/60 p-1.5 last:border-r-0"
                    >
                      {items.map((c) => (
                        <div
                          key={c.id}
                          className="mb-1 rounded-md border px-1.5 py-1 text-[11px] leading-tight"
                          style={{
                            backgroundColor: c.color + "1a",
                            borderColor: c.color + "66",
                          }}
                        >
                          <div className="truncate font-semibold text-foreground">
                            {c.code || c.subject}
                          </div>
                          <div className="truncate" style={{ color: c.color }}>
                            {minutesToTime(timeToMinutes(c.startTime))}
                            {c.room ? ` · ${c.room}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>
  );
}
