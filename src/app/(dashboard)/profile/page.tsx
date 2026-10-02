"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { getGamificationProfile } from "@/app/(dashboard)/pomodoro/gamification-actions";
import { getUserSchedules } from "@/app/(dashboard)/classes/actions";
import { getSyllabi } from "@/app/(dashboard)/syllabus/actions";
import { retry } from "@/lib/retry";
import { withOfflineCache } from "@/lib/offline-cache";
import { cachedAction } from "@/lib/server-action-cache";
import ProfileSheetContent from "@/app/(dashboard)/profile/profile-sheet-content";

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

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const u = user as UserWithExtras | null;
  const router = useRouter();
  const [gamification, setGamification] = useState<GamificationData | null>(null);
  const [schedules, setSchedules] = useState<ScheduleData[] | null>(null);
  const [syllabi, setSyllabi] = useState<SyllabusWithRequirements[] | null>(null);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [loadingSyllabi, setLoadingSyllabi] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  // Detect viewport so we can choose between bottom-sheet (mobile) and full
  // page card (desktop) without a redirect round-trip.
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    getGamificationProfile().then((p) => {
      if (p) setGamification(p);
    });

    setLoadingSchedules(true);
    retry(() => withOfflineCache("schedule:list", () => cachedAction("profile:schedules", () => getUserSchedules())), { delayMs: 2000 })
      .then((data) => {
        setSchedules(data as ScheduleData[]);
        setLoadingSchedules(false);
      })
      .catch(() => {
        setSchedules([]);
        setLoadingSchedules(false);
      });

    setLoadingSyllabi(true);
    retry(() => cachedAction("profile:syllabi", () => getSyllabi()), { delayMs: 2000 })
      .then((data) => {
        setSyllabi(data as unknown as SyllabusWithRequirements[]);
        setLoadingSyllabi(false);
      })
      .catch(() => {
        setSyllabi([]);
        setLoadingSyllabi(false);
      });
  }, [isLoading]);

  function handleClose() {
    router.push("/dashboard");
  }

  // Wait for the viewport check to avoid a flash of the wrong layout.
  if (isDesktop === null) return null;

  // Mobile: render as a bottom sheet (full-screen, slides up from the bottom).
  if (!isDesktop) {
    return (
      <BottomSheet open onClose={handleClose}>
        <ProfileSheetContent
          user={u}
          gamification={gamification}
          schedules={schedules}
          syllabi={syllabi}
          onClose={handleClose}
          loadingSchedules={loadingSchedules}
          loadingSyllabi={loadingSyllabi}
        />
      </BottomSheet>
    );
  }

  // Desktop: render the same content inline, in a centered card — no more
  // round-trip to /settings, no more redirect flicker.
  //
  // `pt-6 md:pt-10` used to stack on the layout's own `md:pt-6`, so desktop
  // opened with 64px of dead space above the profile — the one thing you came
  // here to look at. And the wrapper was still on the old soft-shadow card
  // styling, so it read as a different product from every other card.
  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12 md:pt-0">
      <div className="overflow-hidden rounded-2xl border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32]">
        <ProfileSheetContent
          user={u}
          gamification={gamification}
          schedules={schedules}
          syllabi={syllabi}
          onClose={handleClose}
          loadingSchedules={loadingSchedules}
          loadingSyllabi={loadingSyllabi}
        />
      </div>
    </div>
  );
}
