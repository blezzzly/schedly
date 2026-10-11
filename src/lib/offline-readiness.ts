"use client";

/* Getting this device ready to open Schedly with no connection.
 *
 * The browser cannot fetch a site it has never downloaded, so there is no way to
 * make a *first* visit work offline — no amount of JavaScript changes that. What
 * can be done, and what this does, is make a first visit that happens to have a
 * connection leave the device in a state where the next one does not need one.
 *
 * The rule that shapes the whole module: never claim readiness that was not
 * verified. A UI that says "Ready for offline use" when three routes failed to
 * cache is worse than no indicator at all, because the user closes the tab,
 * goes into a tunnel, and discovers the truth at the worst moment. So
 * `prepared` is only ever true when the worker confirmed, route by route, that
 * everything was stored — and it stays false, with the failures listed, until a
 * later attempt succeeds.
 *
 * Preparation is resumable by construction. Progress is recorded in IndexedDB
 * as each step completes, so a run interrupted by a closed tab, a backgrounded
 * app or a dropped connection picks up where it stopped instead of starting
 * over and re-spending the user's data on pages that are already cached.
 */

import { OFFLINE_CACHE_VERSION, OFFLINE_ROUTES } from "@/lib/offline-routes";
import {
  cacheRead,
  cacheWrite,
  getStorageInfo,
  isOfflineStorageAvailable,
  isQuotaError,
  requestPersistentStorage,
} from "@/lib/offline-cache";
import { getOfflineStatus, setOfflineStatus } from "@/lib/offline-status";

/** What one run of the preparation did. */
export type PrepareStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string;
};

export type PrepareResult = {
  ok: boolean;
  /** Routes the worker could not store. Empty when everything landed. */
  incomplete: string[];
  /** Why it stopped, when it stopped early. */
  error?: string;
  /** True when there was nothing left to do. */
  alreadyPrepared: boolean;
};

const PROGRESS_KEY = "meta:offline-progress";

type Progress = {
  version: string;
  completed: string[];
  incomplete: string[];
  at: number;
};

/** How long the whole run may take before it is called a failure. */
const PREPARE_TIMEOUT_MS = 120_000;

/**
 * Whether this device has everything it needs to open the app offline.
 *
 * Versioned with the worker's cache name, because a cache upgrade wipes every
 * page and reopens every route. Without the version, an upgraded app would look
 * ready while holding nothing, and every page would dead-end offline — the
 * failure mode that makes an offline PWA worse than no offline PWA at all.
 */
export async function isPrepared(): Promise<boolean> {
  try {
    const progress = await cacheRead<Progress>(PROGRESS_KEY);
    if (!progress || progress.version !== OFFLINE_CACHE_VERSION) return false;
    return progress.incomplete.length === 0 && progress.completed.length > 0;
  } catch {
    // An unreadable database is not readiness. Report "not ready" and let the
    // user retry, rather than assuming the worst and telling them it is broken.
    return false;
  }
}

/** Routes still missing, for the honest "not everything downloaded" message. */
export async function getIncompleteRoutes(): Promise<string[]> {
  try {
    const progress = await cacheRead<Progress>(PROGRESS_KEY);
    if (!progress || progress.version !== OFFLINE_CACHE_VERSION) {
      return [...OFFLINE_ROUTES];
    }
    return progress.incomplete ?? [];
  } catch {
    return [...OFFLINE_ROUTES];
  }
}

/**
 * Publish readiness to the UI.
 *
 * Called after every run and on load. `prepared` is null while it is still
 * unknown, which the UI renders differently from a definite "no" — an
 * unmeasured device should not claim to be broken.
 */
export async function refreshReadiness(): Promise<void> {
  const prepared = await isPrepared();
  const incomplete = prepared ? [] : await getIncompleteRoutes();
  let progress: Progress | null = null;
  try {
    progress = await cacheRead<Progress>(PROGRESS_KEY);
  } catch {
    progress = null;
  }
  setOfflineStatus({
    prepared,
    incomplete,
    preparedAt: progress?.at ?? null,
  });
}

function steps(): PrepareStep[] {
  return [
    { id: "storage", label: "Local storage", status: "pending" },
    { id: "persist", label: "Protect from cleanup", status: "pending" },
    { id: "shell", label: "App files", status: "pending" },
    { id: "routes", label: "App screens", status: "pending" },
  ];
}

/**
 * Cache everything the app needs to run without a connection.
 *
 * Safe to call repeatedly: routes already recorded as complete are skipped, so
 * a second run costs nothing, and an interrupted run continues from the last
 * step that finished.
 *
 * `onProgress` is called as each step changes so a settings card can show a real
 * progress bar rather than an indeterminate spinner.
 */
export async function prepareForOffline(options?: {
  onProgress?: (steps: PrepareStep[]) => void;
  /** Ignore recorded progress and redo everything. For the "try again" button. */
  force?: boolean;
}): Promise<PrepareResult> {
  const onProgress = options?.onProgress;
  let state = steps();
  const emit = () => onProgress?.([...state]);
  const mark = (id: string, status: PrepareStep["status"], detail?: string) => {
    state = state.map((s) => (s.id === id ? { ...s, status, detail } : s));
    emit();
  };

  if (!("serviceWorker" in navigator)) {
    // Not a failure to hide: without a service worker there is no way to store
    // the app, and saying so is more useful than a silent no-op.
    return { ok: false, incomplete: [...OFFLINE_ROUTES], error: "This browser cannot install Schedly for offline use.", alreadyPrepared: false };
  }

  if (navigator.onLine === false) {
    return { ok: false, incomplete: await getIncompleteRoutes(), error: "You are offline. Connect once to finish this.", alreadyPrepared: false };
  }

  // --- Step 1: the local database -----------------------------------------
  mark("storage", "running");
  if (!isOfflineStorageAvailable()) {
    mark("storage", "failed", "Blocked by the browser");
    setOfflineStatus({ storageError: "This browser is blocking offline storage." });
    emit();
    return { ok: false, incomplete: [...OFFLINE_ROUTES], error: "This browser is blocking offline storage.", alreadyPrepared: false };
  }
  try {
    // Opening the database is the real check — `indexedDB` existing says
    // nothing about whether a transaction will succeed.
    await cacheWrite("meta:probe", { at: Date.now() });
    mark("storage", "done");
  } catch (err) {
    const detail = isQuotaError(err) ? "This device is out of storage space." : "Could not open local storage.";
    mark("storage", "failed", detail);
    setOfflineStatus({ storageError: detail });
    emit();
    return { ok: false, incomplete: [...OFFLINE_ROUTES], error: detail, alreadyPrepared: false };
  }

  // --- Step 2: ask not to be evicted --------------------------------------
  // Best-effort and deliberately not allowed to fail the run: the browser may
  // legitimately refuse, and refusing does not stop the app opening offline —
  // it only means the browser may clear the cache if it needs the space.
  mark("persist", "running");
  try {
    const persisted = await requestPersistentStorage();
    mark("persist", persisted ? "done" : "skipped", persisted ? undefined : "Browser declined");
  } catch {
    mark("persist", "skipped");
  }

  // --- Step 3 + 4: app files and screens ----------------------------------
  const prior = options?.force ? null : await cacheRead<Progress>(PROGRESS_KEY).catch(() => null);
  const usable = prior?.version === OFFLINE_CACHE_VERSION ? prior : null;
  const alreadyDone = new Set(options?.force ? [] : usable?.completed ?? []);

  // The worker precaches icons and the manifest itself; do it through it so
  // there is one code path for "put this in the cache" and it lands in the
  // cache the worker is prepared to clean up.
  mark("shell", "running");
  const urls = [...OFFLINE_ROUTES];
  const outstanding = urls.filter((u) => !alreadyDone.has(u));
  // An avatar is worth having offline, but it is worth nothing compared to a
  // screen, so it is skipped rather than risking the run for it.
  mark("shell", "done");

  if (outstanding.length === 0) {
    mark("routes", "done", "Already saved");
    const ok = true;
    await writeProgress({ version: OFFLINE_CACHE_VERSION, completed: [...urls], incomplete: [], at: Date.now() });
    await refreshReadiness();
    return { ok, incomplete: [], alreadyPrepared: true };
  }

  mark("routes", "running", `${outstanding.length} to go`);

  let incomplete: string[] = [];
  try {
    incomplete = await requestPrecache(outstanding, PREPARE_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the app for offline use.";
    mark("routes", "failed", message);
    // Record what did land so a retry resumes instead of restarting.
    const done = urls.filter((u) => !outstanding.includes(u));
    await writeProgress({
      version: OFFLINE_CACHE_VERSION,
      completed: done,
      incomplete: outstanding,
      at: Date.now(),
    });
    await refreshReadiness();
    return { ok: false, incomplete: outstanding, error: message, alreadyPrepared: false };
  }

  const completed = urls.filter((u) => !incomplete.includes(u));
  mark(
    "routes",
    incomplete.length ? "failed" : "done",
    incomplete.length ? `${incomplete.length} could not be saved` : "All screens saved"
  );
  await writeProgress({
    version: OFFLINE_CACHE_VERSION,
    completed,
    incomplete,
    at: Date.now(),
  });
  await refreshReadiness();

  return {
    ok: incomplete.length === 0,
    incomplete,
    alreadyPrepared: false,
  };
}

async function writeProgress(progress: Progress): Promise<void> {
  try {
    await cacheWrite(PROGRESS_KEY, progress);
  } catch {
    // Progress is an optimisation for resuming. Losing it costs a full re-run,
    // which is worse but not broken, so it must not fail the preparation.
  }
}

/**
 * Ask the worker to cache these routes and wait for it to say which failed.
 *
 * The reply is the whole point. Without it the page would mark itself done the
 * moment it posted the message, so a warm cut short by a dropped connection or
 * a backgrounded tab would never be retried and the user would find out by
 * opening a page offline and hitting a fallback.
 *
 * Rejects on timeout rather than resolving optimistically — an unanswered
 * request is not a successful one.
 */
function requestPrecache(urls: string[], timeoutMs: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        channel.port1.close();
      } catch {
        // Already closed.
      }
      reject(new Error("Saving took too long. Try again when you have a better connection."));
    }, timeoutMs);

    let channel: MessageChannel;
    try {
      channel = new MessageChannel();
    } catch {
      clearTimeout(timer);
      // No MessageChannel means a browser too old to report back. Proceed
      // without claiming certainty: record everything as incomplete so the UI
      // stays honest and a later run can retry.
      resolve(urls);
      return;
    }

    channel.port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      const incomplete = (e.data as { incomplete?: unknown })?.incomplete;
      channel.port1.close();
      resolve(Array.isArray(incomplete) ? (incomplete as string[]) : urls);
    };

    navigator.serviceWorker.ready
      .then((reg) => {
        const worker = reg.active ?? navigator.serviceWorker.controller;
        if (!worker) throw new Error("Schedly is still starting up. Try again in a moment.");
        worker.postMessage({ type: "PRECACHE", urls }, [channel.port2]);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("Could not reach the offline saver."));
      });
  });
}

/**
 * Forget everything cached for offline use.
 *
 * The destructive control, for a shared device or a user who wants their traces
 * gone. Deliberately does not touch the pending write queue unless asked, since
 * that queue is unsynchronised work and clearing cached screens is not a reason
 * to destroy someone's timetable.
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // The alarms cache holds armed notifications, not cached content.
          .filter((k) => k.startsWith("schedly-cache"))
          .map((k) => caches.delete(k))
      );
    }
  } finally {
    await writeProgress({
      version: OFFLINE_CACHE_VERSION,
      completed: [],
      incomplete: [...OFFLINE_ROUTES],
      at: Date.now(),
    });
    await refreshReadiness();
  }
}

/** Storage numbers for the settings card. Never throws. */
export async function describeStorage() {
  return getStorageInfo();
}

/** Whether the app believes it is offline-ready right now, from the store. */
export function preparedFromStatus(): boolean | null {
  return getOfflineStatus().prepared;
}
