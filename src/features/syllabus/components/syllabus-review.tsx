"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { TextFieldArea } from "@/components/ui/text-field-area";
import {
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { saveSyllabus } from "@/app/(dashboard)/syllabus/actions";
import { ReportErrorButton } from "@/components/report-error-dialog";

type ExtractionData = {
  course: Record<string, unknown>;
  requirements: Record<string, unknown>[];
};

type RequirementRow = {
  id: string;
  title: string;
  type: string;
  description: string;
  date: string;
  startDate: string;
  endDate: string;
  week: string;
  datePrecision: string;
  sourceText: string;
  addToDo: boolean;
  addReminder: boolean;
};

type Props = {
  extraction: ExtractionData;
  fileId: string | null;
  fileName?: string;
  onSaved: () => void;
  onCancel: () => void;
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "assignment", label: "Assignment" },
  { value: "activity", label: "Activity" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "presentation", label: "Presentation" },
  { value: "laboratory", label: "Laboratory" },
  { value: "report", label: "Report" },
  { value: "research", label: "Research" },
  { value: "recitation", label: "Recitation" },
  { value: "practical", label: "Practical" },
  { value: "submission", label: "Submission" },
  { value: "other", label: "Other" },
];

function toRequirementRow(raw: Record<string, unknown>): RequirementRow {
  return {
    id: `new-${Math.random().toString(36).slice(2, 9)}`,
    title: typeof raw.title === "string" ? raw.title : "",
    type: typeof raw.type === "string" ? raw.type : "other",
    description: typeof raw.description === "string" ? raw.description : "",
    date: typeof raw.date === "string" ? raw.date : "",
    startDate: typeof raw.start_date === "string" ? raw.start_date : "",
    endDate: typeof raw.end_date === "string" ? raw.end_date : "",
    week: typeof raw.week === "number" ? String(raw.week) : "",
    datePrecision: typeof raw.date_precision === "string" ? raw.date_precision : "unspecified",
    sourceText: typeof raw.source_text === "string" ? raw.source_text : "",
    addToDo: true,
    addReminder: false,
  };
}

export function SyllabusReview({ extraction, fileId, fileName, onSaved, onCancel }: Props) {
  const course = extraction.course || {};
  const [courseName, setCourseName] = useState(typeof course.name === "string" ? course.name : "");
  const [courseCode, setCourseCode] = useState(typeof course.code === "string" ? course.code : "");
  const [section, setSection] = useState(typeof course.section === "string" ? course.section : "");
  const [instructor, setInstructor] = useState(typeof course.instructor === "string" ? course.instructor : "");
  const [semester, setSemester] = useState(typeof course.semester === "string" ? course.semester : "");
  const [schoolYear, setSchoolYear] = useState(typeof course.school_year === "string" ? course.school_year : "");

  const [requirements, setRequirements] = useState<RequirementRow[]>(
    (extraction.requirements || []).map(toRequirementRow)
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function updateReq(id: string, field: keyof RequirementRow, value: string | boolean) {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  function removeReq(id: string) {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
  }

  function addReq() {
    setRequirements((prev) => [
      ...prev,
      {
        id: `new-${Math.random().toString(36).slice(2, 9)}`,
        title: "",
        type: "other",
        description: "",
        date: "",
        startDate: "",
        endDate: "",
        week: "",
        datePrecision: "unspecified",
        sourceText: "",
        addToDo: true,
        addReminder: false,
      },
    ]);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSave() {
    if (!courseName.trim()) {
      setError("Course name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await saveSyllabus({
        courseName: courseName.trim(),
        courseCode: courseCode.trim() || undefined,
        section: section.trim() || undefined,
        instructor: instructor.trim() || undefined,
        semester: semester.trim() || undefined,
        schoolYear: schoolYear.trim() || undefined,
        fileId: fileId || undefined,
        fileName: fileName || undefined,
        requirements: requirements.map((r) => ({
          title: r.title.trim() || "Untitled",
          type: r.type,
          description: r.description.trim() || undefined,
          date: r.date || undefined,
          startDate: r.startDate || undefined,
          endDate: r.endDate || undefined,
          week: r.week ? parseInt(r.week, 10) : undefined,
          datePrecision: r.datePrecision,
          addToDo: r.addToDo,
          addReminder: r.addReminder,
        })),
      });

      if (result.success) {
        onSaved();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to save syllabus");
    } finally {
      setSaving(false);
    }
  }

  const datedCount = requirements.filter((r) => r.date).length;
  const todoCount = requirements.filter((r) => r.addToDo).length;

  return (
    <div className="space-y-6">
      {/* Course Info */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Course Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextField
            label="Course Name *"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="e.g. IT Fundamentals"
          />
          <TextField
            label="Course Code"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            placeholder="e.g. CS101"
          />
          <TextField
            label="Instructor"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
            placeholder="e.g. Prof. Santos"
          />
          <TextField
            label="Section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="e.g. BSCS-1A"
          />
          <TextField
            label="Semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="e.g. 1st Semester 2026"
          />
          <TextField
            label="School Year"
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="e.g. 2026-2027"
          />
        </div>
      </div>

      {/* Requirements */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Requirements ({requirements.length})
          </h3>
          <Button variant="outline" size="sm" onClick={addReq} className="gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>

        {requirements.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No requirements found. Click &quot;Add&quot; to create one.
          </p>
        )}

        <div className="space-y-2">
          {requirements.map((req) => {
            const isExpanded = expanded[req.id] ?? false;
            const hasDate = !!req.date;
            const isWeekBased = req.datePrecision === "week";

            return (
              <div
                key={req.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-2 p-3">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={req.title}
                      onChange={(e) => updateReq(req.id, "title", e.target.value)}
                      placeholder="Requirement title"
                      className="w-full bg-transparent font-medium text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        value={req.type}
                        onChange={(e) => updateReq(req.id, "type", e.target.value)}
                        className="text-xs bg-muted rounded px-1.5 py-0.5 outline-none"
                      >
                        {TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {hasDate ? (
                        <span className="text-xs text-primary flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {req.date}
                        </span>
                      ) : isWeekBased && req.week ? (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Week {req.week} — exact date not specified
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No date specified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={req.addToDo}
                        onChange={(e) => updateReq(req.id, "addToDo", e.target.checked)}
                        className="rounded"
                      />
                      Todo
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(req.id)}
                      className="h-7 w-7 p-0"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeReq(req.id)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t">
                    <div className="pt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <TextField
                        label="Date"
                        type="date"
                        value={req.date}
                        onChange={(e) => {
                          updateReq(req.id, "date", e.target.value);
                          if (e.target.value) updateReq(req.id, "datePrecision", "exact");
                        }}
                      />
                      <TextField
                        label="Week Number"
                        type="number"
                        value={req.week}
                        onChange={(e) => {
                          updateReq(req.id, "week", e.target.value);
                          if (e.target.value && !req.date) updateReq(req.id, "datePrecision", "week");
                        }}
                        placeholder="e.g. 5"
                      />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">Date Precision</label>
                        <select
                          value={req.datePrecision}
                          onChange={(e) => updateReq(req.id, "datePrecision", e.target.value)}
                          className="h-10 rounded-lg border border-border bg-transparent px-3 text-sm"
                        >
                          <option value="exact">Exact date</option>
                          <option value="range">Date range</option>
                          <option value="week">Week-based</option>
                          <option value="unspecified">Unspecified</option>
                        </select>
                      </div>
                    </div>
                    {req.datePrecision === "range" && (
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          label="Start Date"
                          type="date"
                          value={req.startDate}
                          onChange={(e) => updateReq(req.id, "startDate", e.target.value)}
                        />
                        <TextField
                          label="End Date"
                          type="date"
                          value={req.endDate}
                          onChange={(e) => updateReq(req.id, "endDate", e.target.value)}
                        />
                      </div>
                    )}
                    <TextFieldArea
                      label="Description"
                      value={req.description}
                      onChange={(e) => updateReq(req.id, "description", e.target.value)}
                      placeholder="Optional description"
                    />
                    {req.sourceText && (
                      <div className="text-xs text-muted-foreground italic">
                        Source: &quot;{req.sourceText}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
          <ReportErrorButton
            context="Syllabus review / save"
            errorMessage={error ?? ""}
            page="/syllabus"
          />
        </div>
      )}

      {/* Summary + Save */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Extracted information. Please review dates and requirements before saving.
        </p>
        <p className="text-xs text-muted-foreground">
          Will create: {todoCount} to-do items, {datedCount} calendar events
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save to Schedly
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
