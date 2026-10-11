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

import { cacheRead, cacheRemove, cacheWrite, isNetworkError } from "@/lib/offline-cache";
import { dropPendingWrite, enqueueOfflineWrite, listPendingWrites } from "@/lib/offline-queue";
import type { ExtractedClass } from "@/features/upload/hooks/use-upload";

/**
 * Where a local record is in its life.
 *
 * This replaced a bare `pendingSync: boolean`, which could not tell "saved here
 * and never sent" from "sent and the server refused it" — two states that need
 * completely different responses from the user. The spec's list is followed
 * literally so the wording in the UI matches what a user would expect from a
 * file they can see.
 *
 * - `local`          — saved on this device, not yet offered to the server.
 * - `queued`         — waiting to be sent.
 * - `syncing`        — a request is in flight right now.
 * - `synced`         — the server has it.
 * - `failed`         — the server answered and said no, or it could not be
 *                      reached. The record stays; this is a report, not a
 *                      deletion.
 * - `conflict`       — the server holds a different version and someone has to
 *                      decide. Never resolved automatically.
 */
export type SyncState =
  | "local"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

/** One short word for a badge. Keeps the schedule list readable. */
export const SYNC_LABEL: Record<SyncState, string> = {
  local: "Saved on this device",
  queued: "Waiting to sync",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Not synced",
  conflict: "Needs your attention",
};

/** True while the record still owes the server a write. */
export function isPendingSync(state?: SyncState): boolean {
  return state === "local" || state === "queued" || state === "syncing" || state === "failed";
}


/**
 * Fired after this device's cache is updated, so a list already on screen can
 * re-read it instead of waiting for a navigation.
 *
 * The app writes to IndexedDB and then navigates to /dashboard, but navigating
 * to the page you are already on does not remount it — so without this signal
 * a schedule saved offline is stored correctly and still does not appear.
 */
export const LOCAL_WRITE_EVENT = "schedly:local-write";

/** Mirrors the shape `scheduleRepository.findByUser` returns, plus local state. */
export type LocalSchedule = {
  id: string;
  /** Idempotency key for the queued create that will carry this to the server. */
  clientKey?: string;
  title: string;
  semester: string | null;
  academicYear: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  /** Where this record is in its life. See `SyncState`. */
  syncState?: SyncState;
  /**
   * Kept alongside `syncState` because pages already branch on it, and because
   * records written by an older build have it and nothing else. Anything
   * reading sync detail should use `syncState`.
   */
  pendingSync?: boolean;
  /** Set when a queued write for this record was refused by the server. */
  syncError?: string | null;
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
 * Idempotency key for one offline write.
 *
 * Generated once, when the write is queued, and reused by every retry of it. The
 * server stores it on the schedule and treats a repeat as the same write, which
 * is what stops a retry whose response was lost from producing a second copy of
 * a timetable the user already has.
 */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* --- Validation ------------------------------------------------------------
 * Checked on the device, before anything is written or queued, so an offline
 * user gets the same immediate answer an online one gets from the server's
 * schema rather than discovering the problem minutes later when it syncs.
 * Deliberately the same rules as `saveScheduleSchema`, and only the ones that
 * can be judged without a round trip.
 */

export type ScheduleValidation = {
  ok: boolean;
  error?: string;
};

/**
 * Thrown when a hand-built schedule fails local validation.
 *
 * Distinct from a network failure on purpose. A network error means "saved it,
 * will sync later"; this means "not saved, fix it and try again", and the UI
 * has to say different things for the two. Anything that catches errors from
 * `saveScheduleForOffline` must let this one through rather than queueing the
 * invalid write for a server to reject hours later.
 */
export class OfflineValidationError extends Error {
  readonly validation = true;
  constructor(message: string) {
    super(message);
    this.name = "OfflineValidationError";
  }
}

/** True for "HH:MM" on a 24-hour clock. */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validate a schedule the user built by hand.
 *
 * Mirrors `saveScheduleSchema`: a title, at least one class, each with a
 * subject, at least one day, and a start and end that parse. The one rule
 * added is that a class must end after it starts — the server accepts an
 * overnight range, but that is nearly always a typo on a timetable, and it is
 * far cheaper to say so now than to render a class that runs backwards.
 */
export function validateOfflineSchedule(input: {
  title?: string;
  classes?: Array<{
    subject?: string;
    days?: string[];
    startTime?: string;
    endTime?: string;
  }>;
}): ScheduleValidation {
  if (!input.title?.trim()) {
    return { ok: false, error: "Schedule title is required" };
  }
  const classes = input.classes ?? [];
  if (classes.length === 0) {
    return { ok: false, error: "At least one class is required" };
  }
  for (const c of classes) {
    if (!c.subject?.trim()) {
      return { ok: false, error: "Every class needs a subject" };
    }
    if (!c.days || c.days.length === 0) {
      return { ok: false, error: `"${c.subject}" has no days assigned` };
    }
    if (!TIME_RE.test(c.startTime ?? "") || !TIME_RE.test(c.endTime ?? "")) {
      return { ok: false, error: `"${c.subject}" has an invalid time` };
    }
    if (c.endTime! <= c.startTime!) {
      return { ok: false, error: `"${c.subject}" ends before it starts` };
    }
  }
  return { ok: true };
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
  // Validate here, not on the server. Offline there is no server, so this is
  // the only check the user gets before the work is stored — and a bad entry
  // that syncs hours later is a far worse experience than a refusal now.
  const validation = validateOfflineSchedule(input);
  if (!validation.ok) {
    throw new OfflineValidationError(validation.error ?? "That schedule is not valid.");
  }

  const now = new Date().toISOString();
  // Minted once, here, and reused by every retry of this write. That is what
  // makes a resend idempotent rather than a second timetable.
  const clientKey = newIdempotencyKey("sched");

  const local: LocalSchedule = {
    id: localId("sched"),
    clientKey,
    title: input.title,
    semester: input.semester,
    academicYear: input.academicYear,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncState: "queued",
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
  await enqueueOfflineWrite(
    "schedule.create",
    { ...input, clientKey },
    `Schedule — ${input.title}`,
    { idempotencyKey: clientKey }
  );

  // Tell any list already on screen to re-read the cache.
  //
  // The caller navigates to /dashboard afterwards, but navigating to the page
  // you are already on does not remount it, so its mount-time fetch never runs
  // again. Without this the schedule is saved correctly and the user still
  // cannot see it until they navigate away and back — the one case where the
  // work silently fails to appear.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCAL_WRITE_EVENT, { detail: { key: "schedule:list" } }));
  }
  return true;
}

/* --- Editing and deleting --------------------------------------------------
 * Creating offline was the first case; these are the other two, and they are
 * not symmetric with it.
 *
 * A create is safe to queue blind, because there is nothing on the server to
 * disagree with. An edit is not: the schedule may have changed on another
 * device since this one last saw it, so the queued write carries the version it
 * was based on and the server is asked to refuse it if that version moved. That
 * turns "last writer silently wins" into a conflict the user is told about,
 * which is the only honest outcome when two devices both have the right to
 * change the same timetable.
 */

/** Fields a local edit can change. */
export type OfflineScheduleEdit = {
  title?: string;
  semester?: string | null;
  academicYear?: string | null;
  isActive?: boolean;
};

/**
 * Edit a schedule on this device and queue the change.
 *
 * The cached list is updated first so the edit is visible immediately, then the
 * write is queued. Returns false when the schedule is not in the local cache,
 * which means the caller is looking at something this device has never loaded
 * and must go to the network.
 */
export async function updateScheduleForOffline(
  scheduleId: string,
  patch: OfflineScheduleEdit
): Promise<boolean> {
  const list = ((await cacheRead<LocalSchedule[]>("schedule:list")) ?? []) as LocalSchedule[];
  const index = list.findIndex((s) => s.id === scheduleId);
  if (index === -1) return false;

  const current = list[index]!;
  // `serverVersion` is what this edit was based on. The server compares it and
  // refuses the write if the row has moved on, rather than overwriting a change
  // made on another device.
  const serverVersion = (current as { serverVersion?: string }).serverVersion;

  const updated: LocalSchedule = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    // Already unsynced work stays unsynced — do not downgrade a queued record
    // to "synced" because the user edited it again while still offline.
    syncState: "queued",
    pendingSync: true,
    syncError: null,
  };
  if (serverVersion) (updated as { serverVersion?: string }).serverVersion = serverVersion;

  const next = [...list];
  next[index] = updated;
  await cacheWrite("schedule:list", next);
  await cacheRemove(`schedule:detail:${scheduleId}`);

  await enqueueOfflineWrite(
    "schedule.update",
    { scheduleId, patch, serverVersion },
    `Edit — ${patch.title ?? current.title}`
  );

  notifyLocalWrite();
  return true;
}

/**
 * Delete a schedule on this device and queue the deletion.
 *
 * The record is hidden immediately, because a delete the user cannot see take
 * effect is indistinguishable from a broken button.
 *
 * If the schedule has unsynced work, that work is dropped along with it, and
 * the user is told: the alternative is the queued create landing on the server
 * after the delete, resurrecting a timetable they just removed. Either order is
 * defensible, but "I deleted it and it came back" is not something to ship on
 * its own.
 */
export async function deleteScheduleForOffline(
  scheduleId: string
): Promise<{ queued: boolean; discardedWork: boolean }> {
  const list = ((await cacheRead<LocalSchedule[]>("schedule:list")) ?? []) as LocalSchedule[];
  const target = list.find((s) => s.id === scheduleId);
  if (!target) return { queued: false, discardedWork: false };

  const discardedWork = isPendingSync(target.syncState) && Boolean(target.clientKey);

  if (discardedWork) {
    // Cancel the create rather than queueing a delete against a schedule the
    // server has never heard of.
    const queued = await listPendingWrites();
    for (const entry of queued) {
      if (entry.kind === "schedule.create" && target.clientKey && entry.idempotencyKey === target.clientKey) {
        await dropPendingWrite(entry.id);
      }
    }
  } else {
    await enqueueOfflineWrite(
      "schedule.delete",
      { scheduleId },
      `Delete — ${target.title}`
    );
  }

  await cacheWrite("schedule:list", list.filter((s) => s.id !== scheduleId));
  await cacheRemove(`schedule:detail:${scheduleId}`);
  notifyLocalWrite();
  return { queued: !discardedWork, discardedWork };
}

/**
 * Tell any list already on screen to re-read the cache.
 *
 * Shared by the write helpers so none of them can forget: navigating to the
 * page you are already on does not remount it, so its mount-time fetch never
 * runs again and a correctly-saved edit would stay invisible.
 */
function notifyLocalWrite(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCAL_WRITE_EVENT, { detail: { key: "schedule:list" } }));
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
  syncState?: SyncState;
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
    syncState: "queued",
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

  // Same reason as a schedule: the notes list is already mounted, so it has to
  // be told rather than left showing a stale copy.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCAL_WRITE_EVENT, { detail: { key: "notes:all" } }));
  }
  return true;
}