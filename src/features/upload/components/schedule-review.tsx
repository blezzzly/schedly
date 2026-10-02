"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { ExtractedClass } from "@/features/upload/hooks/use-upload";
import { generateShortName } from "@/lib/abbreviations";
import { cn } from "@/lib/utils";
import { saveDesignState } from "@/features/upload/lib/design-state";
import { PALETTE } from "@/features/upload/lib/palette";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Plus, Trash2, Save, AlertCircle, ChevronDown, Paintbrush, Sparkles, Clock } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
const DAY_LABEL: Record<string, string> = {
  monday: "M", tuesday: "T", wednesday: "W", thursday: "Th",
  friday: "F", saturday: "S", sunday: "Su",
};
const DAY_FULL: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

type Props = {
  classes: ExtractedClass[];
  designImageUrl?: string;
  /**
   * Pin the Cancel/Save row to the bottom of the scroll area. Used inside the
   * bottom sheet, where the form is tall enough that Save would otherwise sit
   * below the fold with no way to reach it without scrolling to the bottom.
   */
  stickyActions?: boolean;
  onUpdate: (index: number, updated: ExtractedClass) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onSave: (classes: ExtractedClass[]) => void;
  onCancel: () => void;
};

export function ScheduleReview({
  classes, designImageUrl, stickyActions = false,
  onUpdate, onRemove, onAdd, onSave, onCancel,
}: Props) {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const isAdmin = Boolean((authUser as { isAdmin?: boolean } | null)?.isAdmin);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleEditDesign = () => {
    if (!designImageUrl) return;
    const ok = saveDesignState({ classes, imageUrl: designImageUrl });
    if (!ok) { setSaveError("Could not open the design editor."); return; }
    router.push("/design");
  };

  const handleSave = async () => {
    const valid = classes.filter((c) => c.subject.trim() && c.days.length > 0);
    if (valid.length === 0) {
      setSaveError("Add at least one class with a subject and day");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(valid);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (i: number, day: string) => {
    const cls = classes[i]!;
    const d = day as ExtractedClass["days"][number];
    const newDays = cls.days.includes(d) ? cls.days.filter((x) => x !== d) : [...cls.days, d];
    onUpdate(i, { ...cls, days: newDays });
  };

  const toggle = (i: number) => setExpanded(expanded === i ? null : i);

  const handleEnter = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (classes[i]?.subject.trim()) { onAdd(); }
    }
  };

  const validCount = classes.filter((c) => c.subject.trim() && c.days.length > 0).length;

  return (
    <div className="space-y-5">

      {/* ── Classes Section ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Classes</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {validCount}/{classes.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && designImageUrl && (
              <Button variant="outline" size="sm" onClick={handleEditDesign}>
                <Paintbrush className="mr-1.5 h-3.5 w-3.5" />
                Edit Design
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Class
            </Button>
          </div>
        </div>

        {classes.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-muted/20 py-12 text-center">
            <p className="text-sm text-muted-foreground">No classes yet.</p>
            <Button variant="link" size="sm" onClick={onAdd} className="mt-1 text-primary">
              Add your first class
            </Button>
          </div>
        )}

        {classes.map((cls, i) => {
          const accent = PALETTE[i % PALETTE.length];
          const isExpanded = expanded === i;
          const isValid = cls.subject.trim() && cls.days.length > 0;

          return (
            <div
              key={i}
              className={`overflow-hidden rounded-2xl border-2 bg-card shadow-sm transition-all ${!isValid ? "border-red-300 dark:border-red-800" : "border-border"}`}
            >
              {/* ── Card Header ── */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer active-scale-touch"
                onClick={() => toggle(i)}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold leading-tight ${cls.subject ? "text-foreground" : "text-muted-foreground italic"}`}>
                    {cls.subject || "Untitled class"}
                  </p>
                  {cls.code && (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">
                      {cls.code}
                    </p>
                  )}
                </div>

                {cls.startTime && cls.endTime && (
                  <div className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">{cls.startTime}–{cls.endTime}</span>
                  </div>
                )}

                {cls.days.length > 0 && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {cls.days.map((d) => (
                      <span
                        key={d}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
                        style={{ backgroundColor: `${accent}20`, color: accent }}
                        title={DAY_FULL[d]}
                      >
                        {DAY_LABEL[d]}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Remove class"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 ${isExpanded ? "rotate-180 bg-muted" : "hover:bg-muted"}`}>
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </div>
              </div>

              {/* ── Expanded Edit Panel ── */}
              {isExpanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Class Info</p>
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="Subject"
                        value={cls.subject}
                        onChange={(e) => onUpdate(i, { ...cls, subject: e.target.value })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="e.g. Mathematics"
                      />
                      <TextField
                        label="Course Code"
                        value={cls.code ?? ""}
                        onChange={(e) => onUpdate(i, { ...cls, code: e.target.value || null })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="e.g. MATH101"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="Instructor"
                        value={cls.instructor ?? ""}
                        onChange={(e) => onUpdate(i, { ...cls, instructor: e.target.value || null })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="—"
                      />
                      <TextField
                        label="Room"
                        value={cls.room ?? ""}
                        onChange={(e) => onUpdate(i, { ...cls, room: e.target.value || null })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="—"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</p>
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="Start"
                        type="time"
                        value={cls.startTime}
                        onChange={(e) => onUpdate(i, { ...cls, startTime: e.target.value })}
                        onKeyDown={(e) => handleEnter(e, i)}
                      />
                      <TextField
                        label="End"
                        type="time"
                        value={cls.endTime}
                        onChange={(e) => onUpdate(i, { ...cls, endTime: e.target.value })}
                        onKeyDown={(e) => handleEnter(e, i)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Days</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DAYS.map((day) => {
                          const active = cls.days.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleDay(i, day)}
                              title={DAY_FULL[day]}
                              className={`min-w-9 h-8 rounded-lg px-2.5 text-xs font-semibold transition-all ${
                                active
                                  ? "text-white shadow-sm"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              }`}
                              style={active ? { backgroundColor: accent } : undefined}
                            >
                              {DAY_LABEL[day]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extra</p>
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="Section"
                        value={cls.section ?? ""}
                        onChange={(e) => onUpdate(i, { ...cls, section: e.target.value || null })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="—"
                      />
                      <TextField
                        label="Block"
                        value={cls.block ?? ""}
                        onChange={(e) => onUpdate(i, { ...cls, block: e.target.value || null })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="—"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <TextField
                        label="Short Name"
                        value={cls.shortName ?? ""}
                        onChange={(e) => onUpdate(i, { ...cls, shortName: e.target.value || null })}
                        onKeyDown={(e) => handleEnter(e, i)}
                        placeholder="Auto"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="mt-5 h-9 w-9 shrink-0"
                        title="Auto-generate short name"
                        onClick={() => onUpdate(i, { ...cls, shortName: generateShortName(cls.subject) || null })}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Error ── */}
      {saveError && (
        <div className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* ── Actions ── */}
      <div
        className={cn(
          "flex gap-3",
          // `sticky` needs the scroll container to be an ancestor, which the
          // bottom sheet's scroller is. The negative margin lets the bar span the
          // full sheet width, cancelled out by the padding the sheet view adds.
          stickyActions &&
            "sticky bottom-0 -mx-4 border-t border-border/50 bg-card/95 px-4 pt-3 pb-1 backdrop-blur-sm"
        )}
      >
        <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || classes.length === 0}
          className="flex-1"
        >
          {saving ? (
            <><Spinner size={16} color="var(--primary-foreground)" /> Saving...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" /> Save Schedule</>
          )}
        </Button>
      </div>

    </div>
  );
}
