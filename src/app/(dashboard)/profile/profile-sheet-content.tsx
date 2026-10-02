"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { 
  GraduationCap, BookOpen, Calendar, FileText,
  Edit3, Share2, Award,
  Layers, Flame, Timer, ChevronDown,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { openQuickAdd } from "@/lib/quick-add-sheet";
import { levelProgress, xpToNextLevel, formatFocusTime } from "@/lib/gamification-levels";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SchedulePreview } from "@/features/schedule/components/schedule-preview";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { uploadAvatar } from "@/app/(dashboard)/settings/actions";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { TextField } from "@/components/ui/text-field";
import { toast } from "sonner";

type UserWithExtras = {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  username?: string;
  createdAt?: string;
  birthdate?: string;
  sex?: string;
  image?: string;
  avatarUrl?: string;
  school?: string;
  course?: string;
  year?: number | string;
  city?: string;
  location?: string;
} & Record<string, unknown>;

type GamificationData = {
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  totalFocusMinutes: number;
};

type ClassDay =
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
  days: ClassDay[];
};

type ScheduleData = {
  id: string;
  title: string;
  semester: string | null;
  academicYear: string | null;
  isActive: boolean;
  createdAt: Date;
  classes: ClassData[];
};

type SyllabusWithRequirements = {
  id: string;
  courseName: string;
  courseCode: string | null;
  section: string | null;
  instructor: string | null;
  semester: string | null;
  schoolYear: string | null;
  department: string | null;
  units: string | null;
  description: string | null;
  fileId: string | null;
  fileName: string | null;
  extractedAt: Date;
  createdAt: Date;
  requirements: Array<{
    id: string;
    title: string;
    type: string;
    dueDate: string | null;
    description: string | null;
  }>;
};

interface ProfileSheetContentProps {
  user: UserWithExtras | null;
  gamification: GamificationData | null;
  schedules: ScheduleData[] | null;
  syllabi: SyllabusWithRequirements[] | null;
  onClose: () => void;
  loadingSchedules?: boolean;
  loadingSyllabi?: boolean;
}

export default function ProfileSheetContent({ 
  user, 
  gamification, 
  schedules, 
  syllabi,
  onClose,
  loadingSchedules = false,
  loadingSyllabi = false,
}: ProfileSheetContentProps) {
  const u = user;

  const [viewOpen, setViewOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const { refetchSession } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    firstName: (u?.firstName as string) || "",
    lastName: (u?.lastName as string) || "",
    username: (u?.username as string) || "",
    school: (u?.school as string) || "",
    course: (u?.course as string) || "",
    year: u?.year != null ? String(u.year) : "",
    city: (u?.city as string) || "",
  });

  function openEdit() {
    setEditForm({
      firstName: (u?.firstName as string) || "",
      lastName: (u?.lastName as string) || "",
      username: (u?.username as string) || "",
      school: (u?.school as string) || "",
      course: (u?.course as string) || "",
      year: u?.year != null ? String(u.year) : "",
      city: (u?.city as string) || "",
    });
    setEditError("");
    setEditOpen(true);
  }

  async function saveEdit() {
    setEditError("");
    const trimmedUsername = editForm.username.trim();
    if (!trimmedUsername) {
      setEditError("Don't forget your username.");
      return;
    }
    setEditSaving(true);
    try {
      const result = await authClient.updateUser({
        name: editForm.lastName ? `${editForm.firstName} ${editForm.lastName}` : editForm.firstName,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        username: trimmedUsername,
        school: editForm.school.trim(),
        course: editForm.course.trim(),
        year: editForm.year.trim() ? Number(editForm.year.trim()) : undefined,
        city: editForm.city.trim(),
      } as Parameters<typeof authClient.updateUser>[0]);

      if (result.error) {
        setEditError(result.error.message || "Failed to update profile.");
      } else {
        refetchSession();
        setEditOpen(false);
      }
    } catch {
      setEditError("Something went wrong. Please try again.");
    }
    setEditSaving(false);
  }

  // Get all unique subjects from all schedules
  const allSubjects = (() => {
    if (!schedules) return [];
    const seen = new Set<string>();
    const subjects: { name: string; code: string | null; schedule: string; color: string }[] = [];
    for (const schedule of schedules) {
      for (const cls of schedule.classes) {
        const key = cls.subject + (cls.code || "");
        if (!seen.has(key)) {
          seen.add(key);
          subjects.push({
            name: cls.subject,
            code: cls.code,
            schedule: schedule.title,
            color: cls.color,
          });
        }
      }
    }
    return subjects;
  })();

  const firstName = u?.firstName || "User";
  const lastName = u?.lastName || "";
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials = firstName.charAt(0).toUpperCase();

  const memberSince = u?.createdAt
    ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const [imgError, setImgError] = useState(false);
  const rawAvatar = pendingUrl || u?.image || u?.avatarUrl || null;
  const resolvedAvatar =
    rawAvatar && !rawAvatar.startsWith("data:") && !rawAvatar.startsWith("http") && rawAvatar.startsWith("/")
      ? `${typeof window !== "undefined" ? window.location.origin : ""}${rawAvatar}`
      : rawAvatar;
  const avatarUrl = imgError ? null : resolvedAvatar;

  const [lastResetPreview, setLastResetPreview] = useState<string | null>(pendingUrl);
  if (pendingUrl && pendingUrl !== lastResetPreview) {
    setLastResetPreview(pendingUrl);
    setImgError(false);
  }

  const isRemoteAvatar =
    avatarUrl &&
    avatarUrl.startsWith("https") &&
    !avatarUrl.startsWith("data:") &&
    !avatarUrl.startsWith("blob:") &&
    !avatarUrl.includes("/api/upload/");

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const preview = URL.createObjectURL(file);
    setPendingUrl(preview);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadAvatar(fd);
      if ("error" in result) {
        setUploadError(result.error);
        setPendingUrl(null);
      } else {
        setPendingUrl(result.url);
      }
    } catch {
      setUploadError("Upload failed. Try again.");
      setPendingUrl(null);
    }
    setUploading(false);
  }

  return (
    <div className="h-full">
      {/* Header with Back Button Only */}
      <div className="sticky top-0 z-10 bg-card border-b border-border/40 px-4 pb-3 pt-1">
        <div className="flex items-center justify-between">
          <button 
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            <ChevronDown className="h-5 w-5 rotate-90" />
            <span>Back</span>
          </button>
          <div className="w-16" />
        </div>
      </div>

      {/* Profile Content */}
      <div className="px-4 pt-4 pb-6 space-y-5">
        
        {/* Avatar & Basic Info */}
        <div className="flex flex-col items-center text-center">
          <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <div
              className="group relative cursor-pointer"
              onClick={() => setViewOpen(true)}
            >
              <div className="h-24 w-24 rounded-full border-4 border-card bg-card shadow-lg overflow-hidden transition-transform group-hover:scale-105">
                {avatarUrl ? isRemoteAvatar ? (
                  <Image
                    src={avatarUrl}
                    alt={displayName}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    onError={() => setImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary/10 text-3xl font-bold text-primary">
                    {initials}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Edit3 className="h-6 w-6 text-white" />
              </div>
            </div>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{displayName}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center p-4">
                {avatarUrl ? isRemoteAvatar ? (
                  <Image
                    src={avatarUrl}
                    alt={displayName}
                    className="max-h-[70vh] max-w-full rounded-xl object-contain"
                  />
                ) : (
                  <img src={avatarUrl} alt={displayName} onError={() => setImgError(true)} className="max-h-[70vh] max-w-full rounded-xl object-contain" />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded-full bg-primary/10 text-5xl font-semibold text-primary">
                    {initials}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <h1 className="text-xl font-bold text-foreground mt-3">{displayName}</h1>
          <p className="text-sm text-muted-foreground">@{u?.username || "username"}</p>
          
          {/* Info Pills */}
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1.5 pt-3">
            {u?.school && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5 text-primary" />
                <span className="truncate max-w-[150px]">{u.school}</span>
              </div>
            )}
            {u?.course && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>{u.course}</span>
              </div>
            )}
            {u?.year && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Award className="h-3.5 w-3.5 text-primary" />
                <span>{u.year}</span>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-center gap-2 pt-4">
            <Button 
              variant="default" 
              size="sm" 
              className="h-9 px-4"
              onClick={openEdit}
            >
              <Edit3 className="h-4 w-4 mr-1.5" />
              Edit Profile
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 px-4"
              onClick={async () => {
                const shareUrl = u?.username
                  ? `${window.location.origin}/u/${encodeURIComponent(u.username)}`
                  : window.location.href;
                const shareData = {
                  title: `${displayName}'s Profile`,
                  text: `Check out ${displayName}'s profile on Schedly!`,
                  url: shareUrl,
                };
                if (navigator.share) {
                  try {
                    await navigator.share(shareData);
                    return;
                  } catch (err) {
                    if ((err as Error)?.name === "AbortError") return;
                  }
                }
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  toast.success("Profile link copied to clipboard!");
                } catch {
                  toast.error("Couldn't share your profile. Try again.");
                }
              }}
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share Profile
            </Button>
          </div>
        </div>

        {/* Edit Profile Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
              <DialogDescription>
                Update your personal details and info.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <TextField
                label="First name"
                value={editForm.firstName}
                onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
              />
              <TextField
                label="Last name"
                value={editForm.lastName}
                onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
              />
              <TextField
                label="Username"
                className="sm:col-span-2"
                value={editForm.username}
                onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
              />
              <TextField
                label="University / School"
                className="sm:col-span-2"
                value={editForm.school}
                onChange={(e) => setEditForm((p) => ({ ...p, school: e.target.value }))}
              />
              <TextField
                label="Course"
                className="sm:col-span-2"
                value={editForm.course}
                onChange={(e) => setEditForm((p) => ({ ...p, course: e.target.value }))}
              />
              <TextField
                label="Year level"
                value={editForm.year}
                inputMode="numeric"
                onChange={(e) => setEditForm((p) => ({ ...p, year: e.target.value }))}
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
            <DialogFooter className="gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line" className="w-full justify-start gap-4 bg-transparent p-0 border-b border-border/40 rounded-none pb-0">
            <TabsTrigger value="overview" className="data-active:font-bold px-0 py-1.5 h-auto">
              Overview
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-active:font-bold px-0 py-1.5 h-auto">
              Schedule
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tab Content */}
        <div className="pt-2">
          
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              
              {/* Personal Details */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">P</span>
                  </div>
                  Personal Details
                </h2>
                <div className="space-y-0 rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
                  <div className="flex items-center justify-between py-2.5 px-3 border-b border-border/40">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <GraduationCap className="h-4 w-4" />
                      <span className="text-xs">University</span>
                    </div>
                    <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{u?.school || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 px-3 border-b border-border/40">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-xs">Course</span>
                    </div>
                    <span className="text-xs font-medium text-foreground">{u?.course || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 px-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Award className="h-4 w-4" />
                      <span className="text-xs">Year Level</span>
                    </div>
                    <span className="text-xs font-medium text-foreground">{u?.year || "Not set"}</span>
                  </div>
                </div>
              </section>
              
              {/* Schedly Stats */}
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center">
                    <Layers className="h-3 w-3 text-primary" />
                  </div>
                  Schedly Stats
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center rounded-lg border border-border/50 bg-muted/30 py-3 px-2">
                    <span className="text-lg font-bold text-foreground">{gamification?.level || 1}</span>
                    <span className="text-[10px] text-muted-foreground">Level</span>
                  </div>
                  <div className="flex flex-col items-center rounded-lg border border-border/50 bg-muted/30 py-3 px-2">
                    <div className="flex items-center gap-1">
                      <Flame className="h-4 w-4 text-orange-500" />
                      <span className="text-lg font-bold text-foreground">{gamification?.currentStreak || 0}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Streak</span>
                  </div>
                  <div className="flex flex-col items-center rounded-lg border border-border/50 bg-muted/30 py-3 px-2">
                    <div className="flex items-center gap-1">
                      <Timer className="h-4 w-4 text-green-500" />
                      {/* Minutes, not truncated hours: rounding 45 minutes down
                          to "0h" made a brand-new user look like they had never
                          focused at all. */}
                      <span className="text-base font-bold tabular-nums text-foreground">
                        {formatFocusTime(gamification?.totalFocusMinutes ?? 0)}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Focused</span>
                  </div>
                </div>
              </section>
              
              {/* XP Progress */}
              {gamification && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Experience Points</span>
                    <span className="text-xs font-bold text-primary">{gamification.xp} XP</span>
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.round(levelProgress(gamification.xp, gamification.level || 1) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    {xpToNextLevel(gamification.xp, gamification.level || 1)} XP to next level
                  </p>
                </section>
              )}
              
            </div>
          )}
          
          {/* Schedule Tab */}
          {activeTab === "schedule" && (
            <div>
              {loadingSchedules ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="ml-2 h-3 w-32" />
                  </div>
                  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(5, minmax(0, 1fr))` }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={`h-${i}`} className="h-8 w-full rounded-md bg-primary/5" />
                    ))}
                  </div>
                  {[1, 2, 3].map((_, rowIdx) => (
                    <div key={rowIdx} className="grid gap-1" style={{ gridTemplateColumns: `repeat(5, minmax(0, 1fr))` }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={`c-${rowIdx}-${i}`} className="h-12 w-full rounded-md bg-primary/5" />
                      ))}
                    </div>
                  ))}
                </div>
              ) : schedules && schedules.length > 0 ? (
                <SchedulePreview classes={schedules[0]!.classes} filename={`${schedules[0]!.title}.png`} bare />
              ) : (
                <div className="py-8 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">No Schedule Yet</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Upload your class schedule to see your timetable here
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      onClose();
                      openQuickAdd();
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Schedule
                  </Button>
                </div>
              )}
            </div>
          )}
          
          {/* Subjects Tab */}
          {activeTab === "subjects" && (
            <div>
              {loadingSchedules ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : allSubjects.length > 0 ? (
                <div className="space-y-2">
                  {allSubjects.map((subject, i) => (
                    <div 
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-3"
                    >
                      <div 
                        className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-white shrink-0"
                        style={{ backgroundColor: subject.color }}
                      >
                        {(subject.code || subject.name).substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{subject.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {subject.code && (
                            <span className="text-[10px] text-muted-foreground">{subject.code}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">· {subject.schedule}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">No Subjects Yet</h3>
                  <p className="text-xs text-muted-foreground">
                    Your subjects will appear here once you upload a schedule
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Activity Tab */}
          {activeTab === "activity" && (
            <div>
              {loadingSyllabi ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : syllabi && syllabi.length > 0 ? (
                <div className="space-y-2">
                  {syllabi.map((s) => (
                    <div 
                      key={s.id}
                      className="rounded-lg border border-border/50 bg-muted/30 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{s.courseName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {s.courseCode && (
                              <span className="text-[10px] text-muted-foreground">{s.courseCode}</span>
                            )}
                            {s.semester && (
                              <span className="text-[10px] text-muted-foreground">· {s.semester}</span>
                            )}
                            {s.schoolYear && (
                              <span className="text-[10px] text-muted-foreground">· {s.schoolYear}</span>
                            )}
                          </div>
                          {s.requirements.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {s.requirements.length} requirement{s.requirements.length !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">No Syllabus Yet</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Upload a syllabus to track course requirements
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = '/syllabus'}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Syllabus
                  </Button>
                </div>
              )}
            </div>
          )}
          
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        {uploadError && (
          <p className="text-xs text-red-500 dark:text-red-400">{uploadError}</p>
        )}
        
        {/* Member since */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Member since {memberSince}
        </p>
      </div>
    </div>
  );
}