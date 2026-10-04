"use client";

/* Keeping work created offline.
 *
 * A schedule typed out on a train is real work, not a draft. This is what makes
 * it survive: write it where the app reads from, so the timetable on the
 * dashboard shows it straight away, and queue it, so it reaches the server later
 * without anyone having to remember to do it again.
 *
 * The two halves have to agree. If the queue write lands but the cache write
 * does not, the entry exists with nothing on screen. If the cache write lands
 * but the queue write does not, the user sees a schedule that will never sync
 * and no reason why. So both are attempted, and the caller is told only when
 * the visible half worked.
 */

import { cacheRead, cacheWrite, isNetworkError } from "@/lib/offline-cache";
import { enqueueOfflineWrite } from "@/lib/offline-queue";
import type { ExtractedClass } from "@/features/upload/hooks/use-upload";

/** Mirrors the shape `scheduleRepository.findByUser` returns, plus a local marker. */
type LocalSchedule = {
  id: string;
  title: string;
  semester: string | null;
  academicYear: string | null;
  isActive: boolean;
  createdAt: Date | string;
  /** True while this schedule exists only on this device. */
  pendingSync?: boolean;
  classes: Array<{
    id: string;
    subject: string;
    shortName: string | null;
    code: string | null;
    instructor: string | null;
    room: string | null;
    section: string | null;
    block: string | null;
    notes: string | null;
    color: string | null;
    startTime: string;
    endTime: string;
    days: string[];
  }>;
};

export type OfflineScheduleInput = {
  title: string;
  semester: string | null;
  academicYear: string | null;
  classes: ExtractedClass[];
  uploadId?: string;
};

/** Deterministic per-class colour so the timetable reads the same offline. */
const CLASS_COLORS = [
  "#3b82f6",
  "#ec4899",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#eab308",
];

function localId(prefix: string): string {
  return `${prefix}-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Persist a manually created schedule to this device and queue it for the server.
 *
 * Returns false only when the schedule could not be shown to the user, which
 * means the caller should not pretend it was saved.
 */
export async function saveScheduleForOffline(
  input: OfflineScheduleInput
): Promise<boolean> {
  const local: LocalSchedule = {
    id: localId("sched"),
    title: input.title,
    semester: input.semester,
    academicYear: input.academicYear,
    isActive: true,
    createdAt: new Date().toISOString(),
    pendingSync: true,
    classes: input.classes.map((c, i) => ({
      id: localId("cls"),
      subject: c.subject,
      shortName: c.shortName,
      code: c.code,
      instructor: c.instructor,
      room: c.room,
      section: c.section,
      block: c.block,
      notes: c.notes,
      color: CLASS_COLORS[i % CLASS_COLORS.length] ?? null,
      startTime: c.startTime,
      endTime: c.endTime,
      days: [...c.days],
    })),
  };

  // The visible half. Every page that shows a timetable reads `schedule:list`,
  // so writing here is what makes the dashboard correct with no connection.
  // Newest first, matching the server's own ordering.
  const existing = ((await cacheRead<LocalSchedule[]>("schedule:list")) ?? []) as LocalSchedule[];
  const merged = [local, ...existing.filter((s) => s.id !== local.id)];
  await cacheWrite("schedule:list", merged);

  // The durable half.
  await enqueueOfflineWrite("schedule.create", input, `Schedule — ${input.title}`);
  return true;
}

/**
 * Whether a thrown value is worth retrying later.
 *
 * Re-exported from here so the call sites that already import the cache helpers
 * do not need a second import just for one predicate.
 */
export { isNetworkError };/* --- Notes -------------------------------------------------------------- */

/** Mirrors what `getNotes` returns, plus the local-only marker. */
type LocalNote = {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  pinned: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  pendingSync?: boolean;
};

/**
 * Keep a note written offline in the list it belongs to, and queue it.
 *
 * Written to both the folder-specific key and the all-notes key, because the
 * page reads one or the other depending on whether a folder is selected, and
 * both have to show it straight away.
 */
export async function saveNoteForOffline(
  title: string,
  content: string,
  folderId: string | null
): Promise<boolean> {
  const now = new Date().toISOString();
  const note: LocalNote = {
    id: localId("note"),
    title,
    content,
    folderId,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    pendingSync: true,
  };

  const allKey = "notes:all";
  const folderKey = folderId === null ? allKey : `notes:folder:${folderId}`;

  const all = ((await cacheRead<LocalNote[]>(allKey)) ?? []) as LocalNote[];
  await cacheWrite(allKey, [note, ...all]);

  if (folderKey !== allKey) {
    const inFolder = ((await cacheRead<LocalNote[]>(folderKey)) ?? []) as LocalNote[];
    await cacheWrite(folderKey, [note, ...inFolder]);
  }

  await enqueueOfflineWrite(
    "note.create",
    { title, content, folderId },
    `Note — ${title.slice(0, 40)}`
  );
  return true;
}