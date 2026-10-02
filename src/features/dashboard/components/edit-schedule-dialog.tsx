"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { updateClasses, type ClassEditInput } from "@/app/(dashboard)/classes/actions";
import type { ClassData } from "@/features/dashboard/lib/types";

type Props = {
  scheduleId: string;
  classes: ClassData[];
  onSaved?: () => void;
};

/** Class times carry the local wall clock in their UTC components. */
function toHHMM(date: Date): string {
  return new Date(date).toISOString().slice(11, 16);
}

const DAY_ORDER = [
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

// Match the timetable's reading order: left-to-right by day, then by time.
function timetableOrder(classes: ClassData[]): ClassData[] {
  return [...classes].sort((a, b) => {
    const da = DAY_ORDER.findIndex((d) => a.days.includes(d as ClassData["days"][number]));
    const db = DAY_ORDER.findIndex((d) => b.days.includes(d as ClassData["days"][number]));
    if (da !== db) return da - db;
    return a.startTime.getTime() - b.startTime.getTime();
  });
}

export function EditScheduleDialog({ scheduleId, classes, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<ClassEditInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEditor = () => {
    // Keep the same order the timetable displays (day, then time).
    setDrafts(
      timetableOrder(classes).map((c) => ({
        id: c.id,
        subject: c.subject,
        shortName: c.shortName,
        code: c.code,
        startTime: toHHMM(c.startTime),
        endTime: toHHMM(c.endTime),
        days: [...c.days],
      }))
    );
    setError(null);
    setOpen(true);
  };

  const toggleDay = (id: string, day: ClassData["days"][number]) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const days = d.days ?? [];
        const next = days.includes(day) ? days.filter((x) => x !== day) : [...days, day];
        if (next.length === 0) return d;
        return { ...d, days: next };
      })
    );
  };

  const update = (id: string, patch: Partial<ClassEditInput>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addSubject = () => {
    setDrafts((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        subject: "",
        shortName: "",
        code: "",
        startTime: "",
        endTime: "",
        days: [],
      },
    ]);
  };

  const removeSubject = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await updateClasses(scheduleId, drafts);
    setSaving(false);
    if (result.success) {
      setOpen(false);
      onSaved?.();
    } else {
      setError(result.error);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openEditor} className="shrink-0">
        <Pencil className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">Edit</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>
              Edit subjects, codes, times, and days — changes apply to the current schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {drafts.map((d) => {
              const classDays = d.days ?? [];
              return (
                <div key={d.id} className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {DAY_ORDER.map((day) => {
                        const on = classDays.includes(day as ClassData["days"][number]);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(d.id, day as ClassData["days"][number])}
                            aria-pressed={on}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                              on
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/60"
                            )}
                          >
                            {DAY_LABELS[day]}
                          </button>
                        );
                      })}
                    </div>
                    {d.id.startsWith("new-") && (
                      <button
                        type="button"
                        onClick={() => removeSubject(d.id)}
                        aria-label="Remove subject"
                        className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Input
                    value={d.subject}
                    onChange={(e) => update(d.id, { subject: e.target.value })}
                    placeholder="Subject name"
                    aria-label="Subject name"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={d.shortName ?? ""}
                      onChange={(e) => update(d.id, { shortName: e.target.value })}
                      placeholder="Short name"
                      aria-label="Short name"
                    />
                    <Input
                      value={d.code ?? ""}
                      onChange={(e) => update(d.id, { code: e.target.value })}
                      placeholder="Code"
                      aria-label="Code"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="block text-[10px] font-medium text-muted-foreground">Start</span>
                      <Input
                        type="time"
                        value={d.startTime ?? ""}
                        onChange={(e) => update(d.id, { startTime: e.target.value })}
                        aria-label="Start time"
                        className="tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[10px] font-medium text-muted-foreground">End</span>
                      <Input
                        type="time"
                        value={d.endTime ?? ""}
                        onChange={(e) => update(d.id, { endTime: e.target.value })}
                        aria-label="End time"
                        className="tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addSubject}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Add subject
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size={14} color="var(--primary-foreground)" /> : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
