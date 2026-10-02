"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit3,
  Trash2,
  AlertCircle,
  Check,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  getSyllabus,
  deleteSyllabus,
  updateSyllabusRequirement,
  deleteSyllabusRequirement,
  addSyllabusRequirement,
  type SyllabusWithRequirements,
} from "../actions";

const TYPE_LABELS: Record<string, string> = {
  assignment: "Assignment",
  activity: "Activity",
  quiz: "Quiz",
  exam: "Exam",
  project: "Project",
  presentation: "Presentation",
  laboratory: "Lab",
  report: "Report",
  research: "Research",
  recitation: "Recitation",
  practical: "Practical",
  submission: "Submission",
  other: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  assignment: "bg-blue-100 text-blue-700",
  activity: "bg-green-100 text-green-700",
  quiz: "bg-yellow-100 text-yellow-700",
  exam: "bg-red-100 text-red-700",
  project: "bg-purple-100 text-purple-700",
  presentation: "bg-pink-100 text-pink-700",
  laboratory: "bg-cyan-100 text-cyan-700",
  report: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-700",
};

type FilterType = "all" | "upcoming" | "dated" | "undated" | "completed";

export default function SyllabusDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [syllabus, setSyllabus] = useState<SyllabusWithRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("other");
  const [addingNew, setAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("assignment");
  const [newDate, setNewDate] = useState("");

  // Show the loading state again when navigating between syllabus pages.
  const [lastLoadedId, setLastLoadedId] = useState(id);
  if (id !== lastLoadedId) {
    setLastLoadedId(id);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getSyllabus(id);
        if (!cancelled) setSyllabus(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDeleteSyllabus() {
    const result = await deleteSyllabus(id);
    if (result.success) {
      router.push("/syllabus");
    }
  }

  async function handleDeleteRequirement(reqId: string) {
    setDeleting(reqId);
    const result = await deleteSyllabusRequirement(reqId);
    if (result.success) {
      setSyllabus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          requirements: prev.requirements.filter((r) => r.id !== reqId),
        };
      });
    }
    setDeleting(null);
  }

  function startEdit(req: SyllabusWithRequirements["requirements"][0]) {
    setEditingId(req.id);
    setEditTitle(req.title);
    setEditDate(req.date || "");
    setEditType(req.type);
  }

  async function saveEdit(reqId: string) {
    const result = await updateSyllabusRequirement(reqId, {
      title: editTitle,
      date: editDate || undefined,
      datePrecision: editDate ? "exact" : "unspecified",
      type: editType,
    });
    if (result.success) {
      setSyllabus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          requirements: prev.requirements.map((r) =>
            r.id === reqId
              ? { ...r, title: editTitle, date: editDate || null, type: editType }
              : r
          ),
        };
      });
    }
    setEditingId(null);
  }

  async function handleAddRequirement() {
    if (!newTitle.trim()) return;
    const result = await addSyllabusRequirement(id, {
      title: newTitle.trim(),
      type: newType,
      date: newDate || undefined,
      datePrecision: newDate ? "exact" : "unspecified",
    });
    if (result.success && result.id) {
      setSyllabus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          requirements: [
            ...prev.requirements,
            {
              id: result.id!,
              title: newTitle.trim(),
              type: newType,
              description: null,
              date: newDate || null,
              startDate: null,
              endDate: null,
              week: null,
              datePrecision: newDate ? "exact" : "unspecified",
              sourceText: null,
              status: "pending",
              addToDo: true,
              addReminder: false,
              reminderMinutes: 1440,
              todoId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        };
      });
    }
    setAddingNew(false);
    setNewTitle("");
    setNewType("assignment");
    setNewDate("");
  }

  function getFilteredRequirements() {
    if (!syllabus) return [];
    const today = new Date().toISOString().slice(0, 10);
    const reqs = syllabus.requirements;

    switch (filter) {
      case "upcoming":
        return reqs.filter((r) => r.date && r.date >= today && r.status !== "completed");
      case "dated":
        return reqs.filter((r) => r.date);
      case "undated":
        return reqs.filter((r) => !r.date);
      case "completed":
        return reqs.filter((r) => r.status === "completed");
      default:
        return reqs;
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!syllabus) {
    return (
      <div className="mx-auto w-full max-w-4xl pt-4 md:pt-0">
        <p className="text-muted-foreground mb-4">Syllabus not found</p>
        <Link href="/syllabus">
          <Button size="sm">Back to Syllabus</Button>
        </Link>
      </div>
    );
  }

  const filtered = getFilteredRequirements();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pt-8 pb-24 md:pt-0 md:pb-8">
      {/* Header */}
      <div>
        <Link
          href="/syllabus"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Syllabus
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{syllabus.courseName}</h1>
            {syllabus.courseCode && (
              <p className="text-muted-foreground">{syllabus.courseCode}</p>
            )}
            {syllabus.instructor && (
              <p className="text-sm text-muted-foreground mt-1">{syllabus.instructor}</p>
            )}
          </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSyllabus}
              className="gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          {(["all", "upcoming", "dated", "undated", "completed"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Requirements */}
        <div className="space-y-2">
          {filtered.map((req) => {
            const isEditing = editingId === req.id;
            const hasDate = !!req.date;
            const isFuture = req.date ? req.date >= today : false;

            return (
              <Card key={req.id} className="overflow-hidden">
                <CardContent className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full font-medium text-sm bg-transparent border-b border-primary outline-none pb-1"
                      />
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="text-xs border rounded px-2 py-1"
                        />
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          className="text-xs border rounded px-2 py-1"
                        >
                          {Object.entries(TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(req.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[req.type] || TYPE_COLORS.other}`}>
                            {TYPE_LABELS[req.type] || req.type}
                          </span>
                          <h4 className="font-medium text-sm truncate">{req.title}</h4>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {hasDate ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {req.date}
                              {isFuture && <Clock className="h-3 w-3 text-primary" />}
                            </span>
                          ) : req.datePrecision === "week" && req.week ? (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Week {req.week}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No date</span>
                          )}
                          {req.status === "completed" && (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Done
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(req)}
                          className="h-7 w-7 p-0"
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRequirement(req.id)}
                          disabled={deleting === req.id}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          {deleting === req.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Add new requirement */}
          {addingNew ? (
            <Card className="border-primary/50">
              <CardContent className="p-4 space-y-3">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Requirement title"
                  className="w-full font-medium text-sm bg-transparent border-b border-primary outline-none pb-1"
                  autoFocus
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="text-xs border rounded px-2 py-1"
                  />
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="text-xs border rounded px-2 py-1"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddRequirement}>
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingNew(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setAddingNew(true)}
            >
              <Plus className="h-4 w-4" />
              Add Requirement
            </Button>
          )}
        </div>

        {/* Empty filter state */}
        {filtered.length === 0 && !addingNew && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No requirements match this filter.
          </div>
        )}
    </div>
  );
}
