"use client";

import { useState, useEffect } from "react";
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

interface ProfileBottomSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileBottomSheet({ open, onClose }: ProfileBottomSheetProps) {
  const { user } = useAuth();
  const u = user as UserWithExtras | null;
  const [gamification, setGamification] = useState<GamificationData | null>(null);
  const [schedules, setSchedules] = useState<ScheduleData[] | null>(null);
  const [syllabi, setSyllabi] = useState<SyllabusWithRequirements[] | null>(null);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [loadingSyllabi, setLoadingSyllabi] = useState(false);

  useEffect(() => {
    if (open && !gamification) {
      getGamificationProfile().then((p) => {
        if (p) setGamification(p);
      });
    }
  }, [open, gamification]);

  useEffect(() => {
    if (!open) return;
    if (!schedules) {
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
    }
  }, [open, schedules]);

  useEffect(() => {
    if (!open) return;
    if (!syllabi) {
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
    }
  }, [open, syllabi]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <ProfileSheetContent
        user={u}
        gamification={gamification}
        schedules={schedules}
        syllabi={syllabi}
        onClose={onClose}
        loadingSchedules={loadingSchedules}
        loadingSyllabi={loadingSyllabi}
      />
    </BottomSheet>
  );
}