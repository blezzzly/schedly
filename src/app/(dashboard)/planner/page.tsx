"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getPlannerWeek,
  createPlannerEntry,
  updatePlannerEntry,
  togglePlannerEntry,
  deletePlannerEntry,
  getPlannerClasses,
  type PlannerClass,
} from "./actions";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CalendarDaysIcon, CalendarIcon, ListIcon, PlusIcon, TrashIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, BookOpenIcon, BriefcaseIcon, ListTodoIcon, HeartIcon, MapPinIcon } from "lucide-react";

type Entry = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  type: string;
  color: string;
  completed: boolean;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const TYPE_OPTIONS = [
  { value: "task", label: "Task", icon: ListTodoIcon, color: "#3b82f6" },
  { value: "study", label: "Study", icon: BookOpenIcon, color: "#22c55e" },
  { value: "event", label: "Event", icon: BriefcaseIcon, color: "#f59e0b" },
  { value: "personal", label: "Personal", icon: HeartIcon, color: "#ec4899" },
];

function formatTime12h(time24: string): string {
  const parts = time24.split(":");
  const h = parts[0] ?? "0";
  const m = parts[1] ?? "00";
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

const PH_TIMEZONE = "Asia/Manila";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function getPhDateParts(date = new Date()): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const find = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: find("year"), month: find("month"), day: find("day") };
}

function getPhDateString(date = new Date()): string {
  const { year, month, day } = getPhDateParts(date);
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, n: number): string {
  const [y = 0, m = 1, d = 1] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function addMonths(dateStr: string, n: number): string {
  const [y = 0, m = 1] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-01`;
}

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00+08:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: PH_TIMEZONE,
  });
}

function getDaysInMonth(dateStr: string): number {
  const [y = 0, m = 1] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function getFirstDayOfMonth(dateStr: string): number {
  const [y = 0, m = 1] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

function getDateLabels(dateStr: string): { weekday: string; weekdayShort: string; monthName: string; dayNum: number } {
  const [y = 0, m = 1, d = 1] = dateStr.split("-").map(Number);
  const w = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return {
    weekday: DAY_FULL[w] ?? "",
    weekdayShort: DAY_NAMES[w] ?? "",
    monthName: MONTH_LABELS[m - 1] ?? "",
    dayNum: d,
  };
}

function classesOnDate(classes: PlannerClass[], dateStr: string): PlannerClass[] {
  const weekday = getDateLabels(dateStr).weekday.toLowerCase();
  return classes.filter((c) => (c.days ?? []).includes(weekday));
}

function classMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function classLabel(c: PlannerClass): string {
  return (c.shortName || "").trim() || (c.code || "").trim() || c.subject;
}

function formatClassTime(c: PlannerClass): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60) % 12 || 12;
    return `${h}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
  };
  return `${fmt(classMinutes(c.startTime))} – ${fmt(classMinutes(c.endTime))}`;
}

type ViewMode = "week" | "month" | "day";

export default function PlannerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(() => getPhDateString());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [classes, setClasses] = useState<PlannerClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [addDate, setAddDate] = useState("");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [type, setType] = useState("task");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const today = getPhDateString();
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const load = useCallback(async () => {
    try {
      const data = await getPlannerWeek(weekStart);
      setEntries(data as Entry[]);
    } catch {
      toast.error("Failed to load planner");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    getPlannerClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, []);

  function openAdd(date: string) {
    setEditEntry(null);
    setAddDate(date);
    setTitle("");
    setStartTime("09:00");
    setEndTime("10:00");
    setType("task");
    setColor("#3b82f6");
    setShowAdd(true);
  }

  function handlePrev() {
    setLoading(true);
    if (viewMode === "week") setWeekStart((d) => addDays(d, -7));
    else if (viewMode === "month") setWeekStart((d) => addMonths(d, -1));
    else setWeekStart((d) => addDays(d, -1));
  }

  function handleNext() {
    setLoading(true);
    if (viewMode === "week") setWeekStart((d) => addDays(d, 7));
    else if (viewMode === "month") setWeekStart((d) => addMonths(d, 1));
    else setWeekStart((d) => addDays(d, 1));
  }

  function handleToday() {
    setLoading(true);
    setWeekStart(getPhDateString());
  }

  function openEdit(entry: Entry) {
    setEditEntry(entry);
    setAddDate(entry.date);
    setTitle(entry.title);
    setStartTime(entry.startTime || "");
    setEndTime(entry.endTime || "");
    setType(entry.type);
    setColor(entry.color);
    setShowAdd(true);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    if (editEntry) {
      const result = await updatePlannerEntry(editEntry.id, title, startTime, endTime, type, color);
      setSaving(false);
      if (result.success) {
        toast.success("Updated");
        setShowAdd(false);
        load();
      } else {
        toast.error(result.error);
      }
    } else {
      const result = await createPlannerEntry(title, addDate, startTime, endTime, type, color);
      setSaving(false);
      if (result.success) {
        toast.success("Added to planner");
        setShowAdd(false);
        load();
      } else {
        toast.error(result.error);
      }
    }
  }

  async function handleToggle(id: string) {
    await togglePlannerEntry(id);
    load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const result = await deletePlannerEntry(deleteId);
    if (result.success) {
      toast.success("Deleted");
      setDeleteId(null);
      load();
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Planner</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {viewMode === "week" && `${formatDisplayDate(today)} — ${formatDisplayDate(addDays(today, 6))}`}
              {viewMode === "month" && new Date(weekStart + "T00:00:00+08:00").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" })}
              {viewMode === "day" && new Date(weekStart + "T00:00:00+08:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:flex">
            <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={handlePrev} className="h-8 w-8">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={handleNext} className="h-8 w-8">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <NotificationBell variant="inline" className="hidden md:flex" />
          </div>
        </div>
      </div>

      <div className="sm:hidden mb-4">
        <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} compact />
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-6xl space-y-4">

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : (
        <>
          {viewMode === "week" && (
            <>
              <div className="overflow-x-auto pb-2 md:hidden -mx-4 px-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 min-w-max">
                  {weekDates.map((date) => {
                    const dayEntries = entries.filter((e) => e.date === date);
                    const isToday = date === today;
                    return <DayCard key={date} date={date} entries={dayEntries} classes={classes} isToday={isToday} onAdd={openAdd} onEdit={openEdit} onToggle={handleToggle} onDelete={setDeleteId} />;
                  })}
                </div>
              </div>

              <div className="hidden md:grid md:grid-cols-3 xl:grid-cols-4 gap-3">
                {weekDates.map((date) => {
                  const dayEntries = entries.filter((e) => e.date === date);
                  const isToday = date === today;
                  return <DayCard key={date} date={date} entries={dayEntries} classes={classes} isToday={isToday} onAdd={openAdd} onEdit={openEdit} onToggle={handleToggle} onDelete={setDeleteId} />;
                })}
              </div>
            </>
          )}

          {viewMode === "month" && (
            <MonthView weekStart={weekStart} entries={entries} onSelectDay={(d) => { setLoading(true); setWeekStart(d); setViewMode("day"); }} />
          )}

          {viewMode === "day" && (
            <DayView date={weekStart} entries={entries.filter((e) => e.date === weekStart)} classes={classes} onAdd={openAdd} onEdit={openEdit} onToggle={handleToggle} onDelete={setDeleteId} />
          )}
</>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editEntry ? "Edit Entry" : "Add to Planner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Start time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <TextField
                label="End time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Type</p>
              <Tabs value={type} onValueChange={(v: string) => {
                const opt = TYPE_OPTIONS.find((o) => o.value === v);
                if (opt) {
                  setType(opt.value);
                  setColor(opt.color);
                }
              }}>
                <TabsList variant="line">
                  {TYPE_OPTIONS.map((opt) => (
                    <TabsTrigger key={opt.value} value={opt.value}>
                      <opt.icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? <Spinner size={16} className="mr-2" /> : null}
              {editEntry ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This planner entry will be permanently deleted.
          </p>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
}

function ViewSwitcher({ viewMode, setViewMode, compact }: {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  compact?: boolean;
}) {
  const tabs: { id: ViewMode; label: string; icon: typeof CalendarDaysIcon }[] = [
    { id: "week", label: "Week", icon: CalendarDaysIcon },
    { id: "month", label: "Month", icon: CalendarIcon },
    { id: "day", label: "Day", icon: ListIcon },
  ];
  return (
    <div className={cn("flex gap-1", compact && "w-full")}>
      {tabs.map((t) => {
        const active = viewMode === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setViewMode(t.id)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              compact && "flex-1 justify-center",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function DayCard({ date, entries, classes, isToday, onAdd, onEdit, onToggle, onDelete }: {
  date: string;
  entries: Entry[];
  classes: PlannerClass[];
  isToday: boolean;
  onAdd: (date: string) => void;
  onEdit: (entry: Entry) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...entries].sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
  const dayClasses = classesOnDate(classes, date).sort(
    (a, b) => classMinutes(a.startTime) - classMinutes(b.startTime)
  );
  const { weekdayShort, dayNum } = getDateLabels(date);

  return (
    <div className={cn(
      "w-full rounded-xl border border-border/50 bg-card transition-all overflow-hidden",
      isToday && "border-primary/40 shadow-[0_0_0_1.5px] shadow-primary/15"
    )}>
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b border-border/30",
        isToday ? "bg-primary/5" : "bg-muted/20"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full font-bold leading-none",
            isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            <span className="text-sm">{dayNum}</span>
          </div>
          <div className="flex flex-col">
            <span className={cn(
              "text-[10px] font-semibold uppercase tracking-wide leading-tight",
              isToday ? "text-primary" : "text-muted-foreground"
            )}>
              {weekdayShort}
            </span>
            {isToday && (
              <span className="text-[9px] font-semibold leading-tight text-primary">Today</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onAdd(date)}
          className="rounded-full p-1 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Add entry"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {dayClasses.length > 0 && (
        <div className="px-2.5 py-1.5 border-b border-border/30 bg-muted/10">
          {dayClasses.map((cls) => (
            <div key={cls.id} className="flex items-center gap-1.5 py-0.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cls.color }} />
              <span className="text-[11px] font-medium text-foreground/80 truncate min-w-0">{classLabel(cls)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="p-1.5 space-y-1 min-h-[80px]">
        {sorted.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-[11px] text-muted-foreground/50">No entries</p>
          </div>
        ) : (
          sorted.slice(0, 4).map((entry) => (
            <div
              key={entry.id}
              onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
              className={cn(
                "w-full text-left rounded-lg overflow-hidden transition-all hover:bg-accent/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring relative cursor-pointer",
                entry.completed && "opacity-50"
              )}
            >
              <div className="flex items-center gap-2 p-2">
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-xs font-medium leading-tight truncate",
                    entry.completed ? "line-through text-muted-foreground" : "text-foreground"
                  )}>
                    {entry.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {entry.startTime && (
                      <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                        {formatTime12h(entry.startTime)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggle(entry.id); }}
                  className="shrink-0 rounded-full p-0.5 hover:bg-accent transition-colors"
                  aria-label={entry.completed ? "Mark incomplete" : "Mark complete"}
                >
                  <CheckIcon className={cn("h-3 w-3", entry.completed ? "text-green-500" : "text-muted-foreground/40")} />
                </button>
              </div>
            </div>
          ))
        )}
        {sorted.length > 4 && (
          <p className="w-full text-center py-1 text-[10px] font-medium text-muted-foreground">
            +{sorted.length - 4} more
          </p>
        )}
      </div>
    </div>
  );
}

function MonthView({ weekStart, entries, onSelectDay }: {
  weekStart: string;
  entries: Entry[];
  onSelectDay: (date: string) => void;
}) {
  const daysInMonth = getDaysInMonth(weekStart);
  const firstDayOfMonth = getFirstDayOfMonth(weekStart);
  const today = getPhDateString();

  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) currentWeek.push("");
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(`${weekStart.slice(0, 8)}${pad2(day)}`);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  while (currentWeek.length < 7) currentWeek.push("");
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries]);

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wider text-muted-foreground uppercase px-2 py-2 border-b">
        {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 px-2 pb-2 pt-1">
        {weeks.map((week, w) => week.map((dateStr, d) => {
          const dayEntries = dateStr ? entriesByDate.get(dateStr) || [] : [];
          const isToday = dateStr === today;
          const hasEntries = dayEntries.length > 0;

          if (!dateStr) return <div key={`${w}-${d}`} className="h-12" />;

          return (
            <button
              key={`${w}-${d}`}
              type="button"
              onClick={() => onSelectDay(dateStr)}
              className={cn(
                "relative flex flex-col items-center justify-center h-12 rounded-lg transition-colors",
                isToday ? "bg-primary/10" : "hover:bg-muted/50"
              )}
              aria-label={`${getDateLabels(dateStr).weekday}, ${dayEntries.length} entries`}
            >
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                isToday ? "bg-primary font-bold text-primary-foreground" : "text-foreground"
              )}>
                {getDateLabels(dateStr).dayNum}
              </span>
              {hasEntries && (
                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {dayEntries.slice(0, 3).map((e, idx) => (
                    <span key={idx} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: e.color }} />
                  ))}
                  {dayEntries.length > 3 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  )}
                </span>
              )}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

function DayView({ date, entries, classes, onAdd, onEdit, onToggle, onDelete }: {
  date: string;
  entries: Entry[];
  classes: PlannerClass[];
  onAdd: (date: string) => void;
  onEdit: (entry: Entry) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isToday = date === getPhDateString();
  const { weekday: dayName, monthName, dayNum } = getDateLabels(date);
  const sortedEntries = [...entries].sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
  const dayClasses = classesOnDate(classes, date).sort(
    (a, b) => classMinutes(a.startTime) - classMinutes(b.startTime)
  );

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{dayName}, {monthName} {dayNum}</p>
          <p className={`text-2xl font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
            {dayNum}
            {isToday && <span className="ml-2 text-sm font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">Today</span>}
          </p>
        </div>
        <Button onClick={() => onAdd(date)} className="h-9 gap-2 rounded-full px-4">
          <PlusIcon className="h-4 w-4" />Add Entry
        </Button>
      </div>

      {dayClasses.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card">
          <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
            <BookOpenIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Classes</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {dayClasses.length}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              From your class schedule
            </span>
          </div>
          <div className="space-y-1.5 p-3">
            {dayClasses.map((cls) => (
              <div
                key={cls.id}
                className="relative overflow-hidden rounded-xl border border-border/50 bg-card/50 px-4 py-2.5"
              >
                <span
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: cls.color }}
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {classLabel(cls)}
                    </p>
                    {(cls.room || cls.instructor) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {cls.room && (
                          <span className="flex items-center gap-1">
                            <MapPinIcon className="h-3 w-3" />
                            {cls.room}
                          </span>
                        )}
                        {cls.instructor && <span>{cls.instructor}</span>}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                    {formatClassTime(cls)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No plans yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dayClasses.length > 0
              ? "Add your study slots, tasks, or personal plans around your classes."
              : "A good day to relax or catch up on tasks."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-0.5 pt-1">
            <ListTodoIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Your plans</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {sortedEntries.length}
            </span>
          </div>
          {sortedEntries.map((entry) => (
            <div
              key={entry.id}
              className="relative overflow-hidden rounded-xl border border-border/50 bg-card px-4 py-3 transition-colors hover:border-primary/30 active:scale-touch"
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className={`truncate font-medium ${entry.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {entry.title}
                    </p>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                      {entry.type}
                    </span>
                  </div>
                  {entry.startTime && (
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded bg-muted text-[11px] font-medium tabular-nums">
                        {formatTime12h(entry.startTime)}
                        {entry.endTime ? ` – ${formatTime12h(entry.endTime)}` : ""}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity hover:opacity-100 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); onToggle(entry.id); }} className="rounded p-2 hover:bg-accent min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label={entry.completed ? "Mark incomplete" : "Mark complete"}>
                    <CheckIcon className={`h-4 w-4 ${entry.completed ? "text-green-500" : "text-muted-foreground"}`} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onEdit(entry); }} className="rounded p-2 hover:bg-accent min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Edit">
                    <EditIcon className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }} className="rounded p-2 hover:bg-accent min-h-[36px] min-w-[36px] flex items-center justify-center" aria-label="Delete">
                    <TrashIcon className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
