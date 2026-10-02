"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { TextField } from "@/components/ui/text-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ListTodo, CircleDot, CalendarDays, CheckCircle2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTodos } from "@/features/todo/use-todos";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";

type FilterType = "all" | "active" | "completed";
type Priority = "low" | "medium" | "high";
type Category = "general" | "school" | "personal" | "work";

const PRIORITY_DOTS: Record<Priority, string> = {
  low: "bg-green-400",
  medium: "bg-yellow-400",
  high: "bg-red-400",
};

const CATEGORY_OPTIONS: { value: Category; label: string; color: string }[] = [
  { value: "general", label: "General", color: "#6b7280" },
  { value: "school", label: "School", color: "#3b82f6" },
  { value: "personal", label: "Personal", color: "#ec4899" },
  { value: "work", label: "Work", color: "#f59e0b" },
];

function dueDateAsLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function dueDateLabel(dateStr: string): string {
  return dueDateAsLocal(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(dateStr: string): boolean {
  const end = dueDateAsLocal(dateStr);
  end.setHours(23, 59, 59);
  return end.getTime() < Date.now();
}

export default function TodoPage() {
  const { todos, addTodo, toggleTodo, deleteTodo, clearCompleted, editTodo } = useTodos();
  const [filter, setFilter] = useState<FilterType>("all");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("general");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("general");

  function handleAdd() {
    if (!newText.trim()) return;
    addTodo(newText, newPriority, newDueDate || undefined, newCategory);
    setNewText("");
    setNewDueDate("");
  }

  function startEdit(id: string, text: string, priority: Priority, dueDate?: string, category?: string) {
    setEditingId(id);
    setEditText(text);
    setEditPriority(priority);
    setEditDueDate(dueDate || "");
    setEditCategory((category as Category) || "general");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await editTodo(id, editText, editPriority, editDueDate || undefined, editCategory);
    setEditingId(null);
  }

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;
  const todoCount = todos.length;

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-3 gap-y-2 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              To-Do List
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep track of your assignments and tasks.
            </p>
          </div>
        </div>
        {todoCount > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <CircleDot className="h-3 w-3" />
              {activeCount} active
            </span>
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />
              {completedCount} done
            </span>
            <NotificationBell variant="inline" className="hidden md:flex" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">

        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-3xl space-y-4">

          {/* Add Task Card */}
          <div className="rounded-2xl border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32] transition-shadow hover:shadow-none p-5">
            <div className="flex items-end gap-2">
              <TextField
                label="New task"
                className="flex-1"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <Button
                onClick={handleAdd}
                disabled={!newText.trim()}
                className="h-11 shrink-0 px-4 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Priority
                </Label>
                <div className="flex gap-1.5">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setNewPriority(p)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        newPriority === p
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/50 bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOTS[p])} />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Category
                </Label>
                <div className="flex gap-1.5">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setNewCategory(c.value)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        newCategory === c.value
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/50 bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="h-8 w-36 text-xs"
                  aria-label="Due date"
                />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
              <TabsList variant="line">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-1 flex-wrap">
              {(["all", ...CATEGORY_OPTIONS.map((c) => c.value)] as const).map((c) => {
                const cat = CATEGORY_OPTIONS.find((opt) => opt.value === c);
                return (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                      categoryFilter === c
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c === "all" ? "All" : cat?.label}
                  </button>
                );
              })}
            </div>
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="flex items-center gap-1 text-xs font-medium text-destructive transition-colors hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear done
              </button>
            )}
          </div>

          {/* Todo List */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32] transition-shadow hover:shadow-none px-6 py-16 text-center">
              <ListTodo className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">
                {filter === "all"
                  ? "No tasks yet"
                  : filter === "active"
                    ? "Nothing to do right now"
                    : "No completed tasks yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filter === "all"
                  ? "Add your first task above to get started."
                  : filter === "active"
                    ? "All tasks are done — take a break!"
                    : "Tasks will show up here once you check them off."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((todo) => {
                const overdue = todo.dueDate ? isOverdue(todo.dueDate) : false;
                const due = todo.dueDate ? dueDateLabel(todo.dueDate) : null;
                const isEditing = editingId === todo.id;
                return (
                  <div
                    key={todo.id}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl bg-card px-4 py-3 transition-colors",
                      todo.completed
                        ? "opacity-60"
                        : ""
                    )}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <TextField
                          label="Edit task"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(todo.id)}
                          autoFocus
                        />
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs font-medium text-muted-foreground">Priority</Label>
                            <div className="flex gap-1.5">
                              {(["low", "medium", "high"] as const).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setEditPriority(p)}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                                    editPriority === p
                                      ? "border-primary/40 bg-primary/10 text-foreground"
                                      : "border-border/50 bg-card text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOTS[p])} />
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs font-medium text-muted-foreground">Category</Label>
                            <div className="flex gap-1.5">
                              {CATEGORY_OPTIONS.map((c) => (
                                <button
                                  key={c.value}
                                  onClick={() => setEditCategory(c.value)}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                    editCategory === c.value
                                      ? "border-primary/40 bg-primary/10 text-foreground"
                                      : "border-border/50 bg-card text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="date"
                              value={editDueDate}
                              onChange={(e) => setEditDueDate(e.target.value)}
                              className="h-8 w-36 text-xs"
                              aria-label="Due date"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-8 text-xs">
                            <X className="mr-1 h-3.5 w-3.5" /> Cancel
                          </Button>
                          <Button size="sm" onClick={() => saveEdit(todo.id)} className="h-8 text-xs">
                            <Check className="mr-1 h-3.5 w-3.5" /> Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={todo.completed}
                          onCheckedChange={() => toggleTodo(todo.id)}
                          aria-label={`Mark ${todo.text} as ${todo.completed ? "active" : "completed"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm font-medium",
                              todo.completed
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            )}
                          >
                            {todo.text}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                              <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOTS[todo.priority])} />
                              {todo.priority}
                            </span>
                            {todo.category && todo.category !== "general" && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${CATEGORY_OPTIONS.find((c) => c.value === todo.category)?.color}20`,
                                  color: CATEGORY_OPTIONS.find((c) => c.value === todo.category)?.color,
                                }}
                              >
                                {CATEGORY_OPTIONS.find((c) => c.value === todo.category)?.label}
                              </span>
                            )}
                            {due && (
                              <span
                                className={cn(
                                  "flex items-center gap-1 text-[11px] font-medium",
                                  overdue && !todo.completed
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                )}
                              >
                                <CalendarDays className="h-3 w-3" />
                                {overdue && !todo.completed ? "Overdue · " : ""}
                                {due}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-4 h-8 w-8 shrink-0 text-muted-foreground/50 hover:text-foreground"
                          onClick={() => startEdit(todo.id, todo.text, todo.priority, todo.dueDate, todo.category)}
                          aria-label={`Edit ${todo.text}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground/50 hover:text-destructive"
                          onClick={() => deleteTodo(todo.id)}
                          aria-label={`Delete ${todo.text}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
