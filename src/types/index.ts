import { type DayOfWeek } from "@/generated/prisma/client";

export type { DayOfWeek, UploadStatus, NotificationType } from "@/generated/prisma/client";

export interface ScheduleWithClasses {
  id: string;
  title: string;
  semester: string | null;
  academicYear: string | null;
  isActive: boolean;
  classes: ClassData[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassData {
  id: string;
  subject: string;
  shortName: string | null;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: DayOfWeek[];
}

export interface ExtractedClass {
  subject: string;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
}

export interface ExtractionResult {
  classes: ExtractedClass[];
  metadata: {
    totalClasses: number;
    confidence: number;
    notes: string | null;
    error?: string;
  };
}

export type ViewMode = "week" | "day";

export type AppError = {
  code: string;
  message: string;
  details?: Record<string, string[]>;
};

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };
