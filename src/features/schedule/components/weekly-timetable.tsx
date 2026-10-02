"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { timeToString } from "@/lib/time";

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
  scheduleTitle: string;
  onDelete?: () => void;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function timeToMinutes(dateOrTime: Date): number {
  const d = new Date(dateOrTime);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function WeeklyTimetable({ classes, scheduleTitle, onDelete }: Props) {
  const activeDays = DAYS.filter((day) =>
    classes.some((c) => c.days.includes(day))
  );

  if (activeDays.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No classes scheduled
      </div>
    );
  }

  const allStartMinutes = classes.map((c) => timeToMinutes(c.startTime));
  const allEndMinutes = classes.map((c) => timeToMinutes(c.endTime));
  const earliestStart = Math.floor(Math.min(...allStartMinutes) / 60) * 60;
  const latestEnd = Math.ceil(Math.max(...allEndMinutes) / 60) * 60;

  const hours: number[] = [];
  for (let m = earliestStart; m < latestEnd; m += 60) {
    hours.push(m);
  }

  const getClassPosition = (cls: ClassData) => {
    const start = timeToMinutes(cls.startTime);
    const end = timeToMinutes(cls.endTime);
    const top = ((start - earliestStart) / (latestEnd - earliestStart)) * 100;
    const height = ((end - start) / (latestEnd - earliestStart)) * 100;
    return { top: `${top}%`, height: `${Math.max(height, 3)}%` };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{scheduleTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {classes.length} class{classes.length !== 1 ? "es" : ""} &middot; {activeDays.length} day{activeDays.length !== 1 ? "s" : ""}
          </p>
        </div>
        {onDelete && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${activeDays.length}, 1fr)` }}>
              <div className="border-b border-r p-2" />
              {activeDays.map((day) => (
                <div key={day} className="border-b border-r last:border-r-0 p-2 text-center text-xs font-medium text-muted-foreground">
                  {DAY_LABELS[day]}
                </div>
              ))}
            </div>

            <div
              className="relative grid"
              style={{ gridTemplateColumns: `60px repeat(${activeDays.length}, 1fr)`, height: `${hours.length * 80}px` }}
            >
              {hours.map((mins, i) => (
                <div
                  key={mins}
                  className="absolute left-0 w-[60px] border-b border-border/50 text-[10px] text-muted-foreground pr-1 text-right"
                  style={{ top: `${(i / hours.length) * 100}%`, height: `${(1 / hours.length) * 100}%` }}
                >
                  <span className="relative -top-2">{minutesToTime(mins)}</span>
                </div>
              ))}

              {activeDays.map((day, dayIndex) => (
                <div
                  key={day}
                  className="absolute border-l border-border/30"
                  style={{
                    left: `calc(60px + ${(dayIndex / activeDays.length) * (100 - (60 / 7))}%)`,
                    width: `${100 / activeDays.length}%`,
                    height: "100%",
                  }}
                />
              ))}

              {classes
                .filter((c) => c.days.some((d) => activeDays.includes(d)))
                .flatMap((cls) =>
                  cls.days
                    .filter((d) => activeDays.includes(d))
                    .map((day) => {
                      const pos = getClassPosition(cls);
                      const dayIdx = activeDays.indexOf(day);
                      return {
                        key: `${cls.id}-${day}`,
                        cls,
                        pos,
                        dayIdx,
                      };
                    })
                )
                .map(({ key, cls, pos, dayIdx }) => (
                  <div
                    key={key}
                    className="absolute rounded-md px-1.5 py-1 text-[10px] leading-tight overflow-hidden cursor-default border"
                    style={{
                      left: `calc(60px + ${(dayIdx / activeDays.length) * 100}%)`,
                      width: `${100 / activeDays.length}%`,
                      top: pos.top,
                      height: pos.height,
                      backgroundColor: cls.color + "20",
                      borderColor: cls.color + "60",
                      color: cls.color,
                      minHeight: "24px",
                    }}
                      title={`${cls.subject}\n${cls.instructor || ""}\n${cls.room || ""}\n${timeToString(cls.startTime)} - ${timeToString(cls.endTime)}`}
                  >
                    <div className="font-semibold truncate text-foreground" style={{ color: cls.color }}>
                      {cls.code || cls.subject}
                    </div>
                    {cls.room && (
                      <div className="truncate opacity-70">{cls.room}</div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
