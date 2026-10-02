"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BookOpen, Plus, Trash2, Clock, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import { SyllabusUploadDialog } from "@/features/syllabus/components/syllabus-upload-dialog";
import { getSyllabi, deleteSyllabus, type SyllabusWithRequirements } from "./actions";

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

export default function SyllabusPage() {
  const [syllabi, setSyllabi] = useState<SyllabusWithRequirements[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadSyllabi();
  }, []);

  async function loadSyllabi() {
    setLoading(true);
    const data = await getSyllabi();
    setSyllabi(data);
    setLoading(false);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    setDeleting(id);
    const result = await deleteSyllabus(id);
    if (result.success) {
      setSyllabi((prev) => prev.filter((s) => s.id !== id));
    }
    setDeleting(null);
  }

  function getUpcomingCount(reqs: SyllabusWithRequirements["requirements"]) {
    const today = new Date().toISOString().slice(0, 10);
    return reqs.filter((r) => r.date && r.date >= today && r.status !== "completed").length;
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Syllabus</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Upload syllabi and organize your academic requirements
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell variant="inline" className="hidden md:flex" />
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-6xl space-y-6">

      {syllabi.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <div className="relative flex w-full min-h-[19rem] flex-col items-center justify-center rounded-2xl border-2 border-foreground/70 bg-card p-6 text-center shadow-[3px_3px_0_0_#401f32]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <BookOpen className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No syllabi yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground leading-relaxed">
              Upload your first syllabus to organize academic requirements
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-row gap-3">
              <Button className="flex-1 h-11 px-6 font-medium" onClick={() => setUploadOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Syllabus
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {syllabi.map((syllabus) => {
            const upcoming = getUpcomingCount(syllabus.requirements);
            const total = syllabus.requirements.length;
            const completed = syllabus.requirements.filter((r) => r.status === "completed").length;

            return (
              <Link key={syllabus.id} href={`/syllabus/${syllabus.id}`}>
                <Card className="group transition-colors hover:border-border hover:bg-accent/50 cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold truncate">{syllabus.courseName}</h3>
                        {syllabus.courseCode && (
                          <p className="text-sm text-muted-foreground">{syllabus.courseCode}</p>
                        )}
                        {syllabus.instructor && (
                          <p className="text-sm text-muted-foreground truncate">{syllabus.instructor}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete"
                          onClick={(e) => handleDelete(e, syllabus.id)}
                          disabled={deleting === syllabus.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {total} requirement{total !== 1 ? "s" : ""}
                      </span>
                      {upcoming > 0 && (
                        <span className="flex items-center gap-1 text-primary">
                          <Clock className="h-3.5 w-3.5" />
                          {upcoming} upcoming
                        </span>
                      )}
                      {completed > 0 && (
                        <span className="text-green-600">
                          {completed} done
                        </span>
                      )}
                    </div>

                    {syllabus.requirements.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {syllabus.requirements.slice(0, 4).map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          >
                            {TYPE_LABELS[r.type] || r.type}
                          </span>
                        ))}
                        {syllabus.requirements.length > 4 && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            +{syllabus.requirements.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <SyllabusUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={() => {
          setUploadOpen(false);
          loadSyllabi();
        }}
      />
        </div>
      </div>
    </div>
  );
}
