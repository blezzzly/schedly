"use client";

/* Offline write queue.
 *
 * Creating something while offline has to end up in two places: the screen, so
 * the user sees their work immediately, and the server, so it still exists
 * tomorrow. The screen half is a cache write. This is the server half.
 *
 * Each entry is a serialisable descriptor — a `kind` string plus a payload. The
 * function that knows how to perform it is registered at app start, because a
 * function cannot be written to IndexedDB. Replay looks the handler up by kind.
 *
 * Nothing here silently drops a write. If replay fails the entry stays in the
 * queue and is retried, because a schedule someone typed out and watched appear
 * must not evaporate because one request timed out.
 */

import { queueDelete, queueGetAll, queueCount, queuePut } from "@/lib/offline-cache";

export type PendingWrite = {
  id: string;
  kind: string;
  /** Shown in the "waiting to sync" line, e.g. "Schedule — BSIT 1st Year". */
  label: string;
  payload: unknown;
  createdAt: number;
};

type Handler = (payload: never) => Promise<unknown>;

const handlers = new Map<string, Handler>();

const listeners = new Set<() => void>();
let pending = 0;

/** Teach the queue how to perform one kind of write. Registered at app start. */
export function registerOfflineHandler(kind: string, handler: Handler): void {
  handlers.set(kind, handler);
}

/** Subscribe to the pending count. Returns an unsubscribe function. */
export function subscribeOfflineQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How many writes are waiting to reach the server. */
export function getPendingCount(): number {
  return pending;
}

/** Re-read the queue and tell subscribers. */
export async function refreshPendingCount(): Promise<number> {
  pending = await queueCount();
  listeners.forEach((l) => l());
  return pending;
}

/**
 * Queue a write and refresh the pending count.
 *
 * Call this only after the live attempt has already failed with a network
 * error, and only once the optimistic cache write has been made. Queueing first
 * and caching second risks the entry existing with nothing to show for it.
 */
export async function enqueueOfflineWrite(
  kind: string,
  payload: unknown,
  label: string
): Promise<PendingWrite> {
  const entry: PendingWrite = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    label,
    payload,
    createdAt: Date.now(),
  };
  await queuePut(entry);
  await refreshPendingCount();
  return entry;
}

/** Remove one write, by id. */
export async function dropPendingWrite(id: string): Promise<void> {
  await queueDelete(id);
  await refreshPendingCount();
}

/** Every waiting write, oldest first. */
export function listPendingWrites(): Promise<PendingWrite[]> {
  return queueGetAll<PendingWrite>().catch(() => []);
}

/**
 * Replay everything waiting.
 *
 * Stops at the first failure rather than pressing on. The writes are ordered,
 * and several of them touch the same list — replaying the third of a set after
 * the second failed would write out of order and produce a timetable that does
 * not match what the user typed. Better to retry the whole line next time.
 *
 * A handler that reports a business failure (the server said no, with a
 * reason) drops the entry, because retrying it forever would be pointless. Only
 * a thrown error, which means we never got an answer, keeps it queued.
 */
export async function flushOfflineWrites(): Promise<{ sent: number; failed: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: pending };
  }

  const entries = await listPendingWrites();
  let sent = 0;
  let failed = 0;

  for (const entry of entries) {
    const handler = handlers.get(entry.kind);
    if (!handler) {
      // Nothing knows how to do this one yet. That is almost always a code
      // loading state rather than a write we will never be able to perform —
      // the handlers live in the dashboard layout, so an entry replayed from a
      // page that has not loaded them yet would look identical.
      //
      // Deleting here would throw away someone's timetable because of which
      // route they happened to be on. Stop and retry on the next trigger
      // instead. The only way out is the user doing something else, and that is
      // a far better outcome than silent data loss.
      failed += 1;
      break;
    }

    try {
      await (handler as (p: unknown) => Promise<unknown>)(entry.payload);
      await queueDelete(entry.id);
      sent += 1;
    } catch (err) {
      if (isPermanentRejection(err)) {
        await queueDelete(entry.id);
        failed += 1;
        continue;
      }
      // We never got an answer. Keep it and stop; the next trigger tries again.
      failed += 1;
      break;
    }
  }

  await refreshPendingCount();

  // Tell anything showing a cached list that the server now has the real thing.
  // Without this the dashboard keeps rendering the local placeholder, which is
  // now duplicated by a genuine server row — the user sees the same timetable
  // twice, or sees one that never updates. A CustomEvent keeps this decoupled:
  // the queue does not need to know that any page is listening.
  if (sent > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUEUE_FLUSHED_EVENT, { detail: { sent, failed } }));
  }

  return { sent, failed };
}

/** Fired after one or more queued writes reached the server. */
export const QUEUE_FLUSHED_EVENT = "schedly:queue-flushed";

/**
 * Whether a rejection means "do not retry".
 *
 * Server actions report a refusal as `{ success: false }` rather than throwing,
 * so a thrown error here means the request itself failed — worth another try.
 * A `permanent: true` marker is the one case we drop, for handlers that can
 * tell the difference.
 */
function isPermanentRejection(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { permanent?: boolean }).permanent === true
  );
}

let syncStarted = false;

/**
 * Start replaying the queue whenever the app might have connectivity.
 *
 * `online` alone is not enough. A phone that reports itself online while every
 * request fails is the common case here, so the queue is also drained on focus,
 * on becoming visible, and on a slow interval. All of them are cheap when the
 * queue is empty — flush returns immediately.
 */
export function startOfflineQueueSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (syncStarted) return () => {};
  syncStarted = true;

  void refreshPendingCount();

  const attempt = () => {
    void flushOfflineWrites();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") attempt();
  };

  window.addEventListener("online", attempt);
  window.addEventListener("focus", attempt);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(attempt, 60_000);

  return () => {
    syncStarted = false;
    window.removeEventListener("online", attempt);
    window.removeEventListener("focus", attempt);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}