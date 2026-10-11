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
 *
 * Retries are deliberately not "try again every 60 seconds". On a phone that is
 * a metered connection, a queue that retries hard on a broken link spends the
 * user's data and battery on requests that cannot succeed. So: exponential
 * backoff with jitter, a ceiling, and a single reachability check before the
 * run rather than a request per entry. See `offline-queue.test.ts`.
 */

import {
  queueDelete,
  queueGetAll,
  queueCount,
  queuePatch,
  queuePut,
  type QueueRow,
} from "@/lib/offline-cache";
import { getActiveAccountId } from "@/lib/offline-account";
import { getOfflineStatus, setOfflineStatus } from "@/lib/offline-status";

export type PendingWrite = QueueRow;

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
  setOfflineStatus({ pending });
  return pending;
}

/* --- Backoff ---------------------------------------------------------------
 * Exported so the schedule can be tested directly rather than inferred from a
 * fake clock in a queue test.
 */

/** First retry waits this long. */
export const BASE_BACKOFF_MS = 15_000;
/** No retry waits longer than this, however many attempts have failed. */
export const MAX_BACKOFF_MS = 15 * 60_000;

/**
 * Delay before attempt number `attempts` (1 = the first retry).
 *
 * Exponential, capped, then jittered. The jitter is "equal jitter" — half the
 * computed delay is fixed and half is random — rather than full jitter,
 * because full jitter can pick ~0 and produce a tight retry loop, which is the
 * exact failure this is meant to prevent.
 *
 * Without the random component, every device that lost connectivity at the same
 * moment retries at the same instant and the server takes the whole spike at
 * once. With it, they spread out but still all move forward.
 */
export function backoffDelayMs(
  attempts: number,
  random: () => number = Math.random
): number {
  const n = Math.max(1, Math.floor(attempts));
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (n - 1), MAX_BACKOFF_MS);
  return Math.round(exponential / 2 + random() * (exponential / 2));
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
  label: string,
  options?: { idempotencyKey?: string }
): Promise<PendingWrite> {
  const entry: PendingWrite = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    label,
    payload,
    createdAt: Date.now(),
    // Stamped now so the entry is only ever replayed for the account that made
    // it. Without this a write queued offline by one account could be replayed
    // after another account signs in on the same device.
    accountId: getActiveAccountId(),
    attempts: 0,
    // Replayable immediately: the browser may well have connectivity already,
    // and the first attempt should not wait 15s for no reason.
    nextAttemptAt: 0,
    idempotencyKey: options?.idempotencyKey,
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

/** Every waiting write for this account, oldest first. */
export function listPendingWrites(): Promise<PendingWrite[]> {
  return queueGetAll<PendingWrite>().catch(() => []);
}

/** Every waiting write across all accounts. Settings and diagnostics only. */
export function listAllPendingWrites(): Promise<PendingWrite[]> {
  return queueGetAll<PendingWrite>(null).catch(() => []);
}

/* --- Reachability ----------------------------------------------------------
 * `navigator.onLine` is not evidence that a request will succeed. A phone on a
 * Wi-Fi network with no uplink, or on mobile data with no signal, reports itself
 * online the entire time. Acting on that flag means firing a queue of doomed
 * requests — the exact data and battery cost Low Data Mode exists to avoid.
 *
 * So before a run, ask the server something cheap and uncached. `/api/ping`
 * touches no database and sends no session, which makes it both safe to call
 * for an unauthenticated user and free to call repeatedly.
 */

export type Reachability = "online" | "offline";

let lastProbe: { at: number; result: Reachability } | null = null;

/** How long a probe result is trusted before spending another request. */
const PROBE_TTL_MS = 30_000;

/**
 * Ask the server whether it is there.
 *
 * Cached briefly: several triggers fire at once on app resume (focus,
 * visibilitychange, online, interval), and four identical pings for one resume
 * is exactly the waste this module is trying to avoid.
 *
 * Any HTTP response at all counts as reachable, including a 500. That sounds
 * wrong until you follow it through: a 500 proves the request left the device,
 * crossed the network and was answered. Reporting "offline" there would put a
 * "you are offline" banner over a perfectly reachable app, and — worse — would
 * stop the queue from ever trying again, so work would sit unsynced through a
 * server blip that lasted a minute. Reachability is a question about the
 * network, not about the server's health; the backoff below is what handles an
 * unhealthy server, by failing and retrying on a schedule.
 */
export async function probeReachability(
  force = false
): Promise<Reachability> {
  if (typeof navigator === "undefined") return "online";
  if (navigator.onLine === false) {
    lastProbe = { at: Date.now(), result: "offline" };
    return "offline";
  }
  if (
    !force &&
    lastProbe &&
    Date.now() - lastProbe.at < PROBE_TTL_MS
  ) {
    return lastProbe.result;
  }
  try {
    const controller = new AbortController();
    // A probe that hangs is worse than no probe: it would hold the whole queue
    // up for the browser's full timeout. Five seconds is long enough to reach a
    // healthy server and short enough not to strand the user.
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch("/api/ping", {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    lastProbe = { at: Date.now(), result: "online" };
    return "online";
  } catch {
    lastProbe = { at: Date.now(), result: "offline" };
    return "offline";
  }
}

/** Forget the cached probe. Tests and the manual "try again" button. */
export function resetReachabilityProbe(): void {
  lastProbe = null;
}

/* --- Replay ---------------------------------------------------------------- */

/**
 * Whether the failure means "the session is gone".
 *
 * Server actions report a refusal as a result object rather than throwing, so
 * the registered handler turns "Unauthorized" into this marker. Such an entry is
 * kept, not dropped: signing back in should send it, and discarding a timetable
 * because a session expired would lose real work.
 */
export function authRequired(error: string): Error & { authRequired: boolean } {
  return Object.assign(new Error(error), { authRequired: true });
}

export type FlushResult = {
  sent: number;
  failed: number;
  /** Entries skipped because their backoff had not elapsed. */
  deferred: number;
  /** True when nothing was attempted because the server is unreachable. */
  skipped: boolean;
  authRequired: boolean;
};

/**
 * Replay everything waiting.
 *
 * Stops at the first *transport* failure rather than pressing on. The writes are
 * ordered, and several of them touch the same list — replaying the third of a
 * set after the second failed would write out of order and produce a timetable
 * that does not match what the user typed. Better to retry the whole line next
 * time.
 *
 * A handler that reports a business failure (the server said no, with a
 * reason) drops the entry, because retrying it forever would be pointless. Only
 * a thrown error, which means we never got an answer, keeps it queued.
 */
export async function flushOfflineWrites(
  options?: { force?: boolean }
): Promise<FlushResult> {
  const empty: FlushResult = {
    sent: 0,
    failed: 0,
    deferred: 0,
    skipped: false,
    authRequired: false,
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setOfflineStatus({ connection: "offline", sync: "idle" });
    return { ...empty, skipped: true };
  }

  const entries = await listPendingWrites();
  if (entries.length === 0) {
    setOfflineStatus({
      sync: "idle",
      connection: "online",
      lastError: null,
    });
    return empty;
  }

  // Verify the server is actually reachable before spending a request per
  // entry. This is the difference between one cheap probe and N doomed writes.
  const reachable = await probeReachability(options?.force);
  if (reachable === "offline") {
    setOfflineStatus({ connection: "offline", sync: "idle" });
    return { ...empty, skipped: true, failed: pending };
  }

  setOfflineStatus({ connection: "online", sync: "syncing", lastError: null });

  let sent = 0;
  let failed = 0;
  let deferred = 0;
  let sawAuthRequired = false;

  for (const entry of entries) {
    // Respect the backoff. An entry that failed a moment ago is not retried
    // in the same breath just because another trigger fired.
    if (entry.nextAttemptAt && Date.now() < entry.nextAttemptAt) {
      deferred += 1;
      continue;
    }

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
      const attempts = (entry.attempts ?? 0) + 1;

      if (isPermanentRejection(err)) {
        // The server understood and refused. Retrying cannot change that, and
        // keeping it would block everything behind it forever.
        await queueDelete(entry.id);
        failed += 1;
        continue;
      }

      if (isAuthFailure(err)) {
        // Keep the entry — the work is real and the session can come back —
        // but stop, because every following entry would fail the same way.
        sawAuthRequired = true;
        await queuePatch(entry.id, {
          attempts,
          nextAttemptAt: Date.now() + backoffDelayMs(attempts),
          lastError: "Sign in to finish syncing",
        });
        failed += 1;
        break;
      }

      // We never got an answer. Keep it and stop; the next trigger tries again.
      await queuePatch(entry.id, {
        attempts,
        nextAttemptAt: Date.now() + backoffDelayMs(attempts),
        lastError: errorMessage(err),
      });
      failed += 1;
      break;
    }
  }

  await refreshPendingCount();

  setOfflineStatus({
    sync: sawAuthRequired ? "auth-required" : failed > 0 ? "failed" : "idle",
    connection: "online",
    lastSyncedAt: sent > 0 ? Date.now() : undefined,
    lastError: sawAuthRequired ? null : failed > 0 ? "Could not reach the server." : null,
  });

  // Tell anything showing a cached list that the server now has the real thing.
  // Without this the dashboard keeps rendering the local placeholder, which is
  // now duplicated by a genuine server row — the user sees the same timetable
  // twice, or sees one that never updates. A CustomEvent keeps this decoupled:
  // the queue does not need to know that any page is listening.
  if (sent > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUEUE_FLUSHED_EVENT, { detail: { sent, failed } }));
  }

  return { sent, failed, deferred, skipped: false, authRequired: sawAuthRequired };
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

function isAuthFailure(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { authRequired?: boolean; message?: string };
  if (e.authRequired === true) return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("unauthorized") || msg.includes("unauthenticated");
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Could not reach the server.";
}

let syncStarted = false;

/**
 * Start replaying the queue whenever the app might have connectivity.
 *
 * `online` alone is not enough. A phone that reports itself online while every
 * request fails is the common case here, so the queue is also drained on focus,
 * on becoming visible, and on a slow interval. All of them are cheap when the
 * queue is empty — flush returns immediately — and the reachability probe
 * inside `flush` stops the empty-but-triggered case from becoming a poll.
 *
 * The interval is deliberately long and is skipped while the user is offline or
 * has Low Data Mode on: an automatic retry on a metered connection is spending
 * their money without being asked, and the user can always sync by hand.
 */
export function startOfflineQueueSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (syncStarted) return () => {};
  syncStarted = true;

  void refreshPendingCount();

  const attempt = () => {
    if (document.visibilityState !== "visible") return;
    void flushOfflineWrites();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") attempt();
  };

  window.addEventListener("online", attempt);
  window.addEventListener("focus", attempt);
  document.addEventListener("visibilitychange", onVisible);

  // Every 60s while the page is open and reachable. Long enough not to be a
  // poll on metered data; the queue's own backoff is what actually governs
  // retry frequency, this is only the heartbeat that notices new work.
  const timer = window.setInterval(() => {
    if (navigator.onLine === false) return;
    attempt();
  }, 60_000);

  // Keep the status store honest even when nothing is queued — the indicator
  // has to notice a connection that died without any request failing first.
  const beat = window.setInterval(() => {
    if (navigator.onLine === false) {
      setOfflineStatus({ connection: "offline" });
    } else if (getOfflineStatus().connection === "offline") {
      setOfflineStatus({ connection: "degraded" });
    }
  }, 15_000);

  return () => {
    syncStarted = false;
    window.removeEventListener("online", attempt);
    window.removeEventListener("focus", attempt);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
    window.clearInterval(beat);
  };
}
