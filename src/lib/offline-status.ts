"use client";

/* One place that knows what the app's connection to the outside world is
 * doing, so every screen reports the same thing.
 *
 * The states are deliberately explicit rather than derived from
 * `navigator.onLine`. That flag lies constantly on Android — a phone attached
 * to a Wi-Fi network with no working uplink reports itself online while every
 * request fails, and a phone that has just come back from a tunnel reports
 * offline for a second after it is usable again. An interface that trusts it
 * shows "Online" over a permanently failing screen.
 *
 * This store is the app's own answer, built from three inputs: what the browser
 * claims, whether a request to the server has actually succeeded recently, and
 * what the write queue is doing about it.
 */

/**
 * How the app can reach the server, as far as we know.
 *
 * - `online`      — a request has succeeded recently. The normal case.
 * - `degraded`    — the browser says online, or connectivity just returned, but
 *                   the server has not been reached yet. We are guessing
 *                   "probably reachable" and say so.
 * - `offline`     — requests are failing, or the browser says there is no
 *                   network. Cached data is what is on screen.
 */
export type ConnectionState = "online" | "degraded" | "offline";

/**
 * What the write queue is doing.
 *
 * `idle` covers both "nothing to send" and "sent"; the pending count is what
 * distinguishes them, and a queue of zero is not worth its own banner.
 */
export type SyncState =
  | "idle"
  | "syncing"
  | "failed"
  | "auth-required"
  | "blocked";

export type OfflineStatus = {
  connection: ConnectionState;
  sync: SyncState;
  /** Writes saved on this device that the server has not accepted. */
  pending: number;
  /** Epoch ms of the last successful flush, or null if never. */
  lastSyncedAt: number | null;
  /** Why the last flush failed, for the status sheet. */
  lastError: string | null;
  /** Routes the worker could not cache on the last prepare. Empty when complete. */
  incomplete: string[];
  /** Whether every route in the app is cached and the app opens offline. */
  prepared: boolean | null;
  preparedAt: number | null;
  /** Set when storage is blocked or full. */
  storageError: string | null;
  /** Epoch ms of this snapshot; identity for useSyncExternalStore. */
  revision: number;
};

const initial: OfflineStatus = {
  connection: "degraded",
  sync: "idle",
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
  incomplete: [],
  prepared: null,
  preparedAt: null,
  storageError: null,
  revision: 0,
};

let snapshot: OfflineStatus = initial;
let revision = 0;

const listeners = new Set<() => void>();

/** Subscribe to status changes. Returns an unsubscribe function. */
export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Current status. Stable identity between changes, which is what
 * `useSyncExternalStore` needs to avoid an infinite render loop.
 */
export function getOfflineStatus(): OfflineStatus {
  return snapshot;
}

function emit(): void {
  revision += 1;
  snapshot = { ...snapshot, revision };
  listeners.forEach((l) => l());
}

/**
 * Merge a change into the status.
 *
 * Replaces the object only when something actually differs, so subscribers —
 * and `useSyncExternalStore` in particular — see a stable reference while
 * nothing is happening. A new object on every call would re-render the status
 * indicator forever, which on a low-end phone is a real cost for a badge that
 * has not changed.
 *
 * Undefined values are ignored rather than written: callers pass
 * `{ lastError: maybeUndefined }` to mean "leave this alone", and treating that
 * as a change would both bump the revision and blank the field.
 */
export function setOfflineStatus(patch: Partial<OfflineStatus>): void {
  let changed = false;
  // Built as a full snapshot rather than a partial, so the per-key assignment
  // below stays type-safe without a cast.
  const next: OfflineStatus = { ...snapshot };
  for (const key of Object.keys(patch) as (keyof OfflineStatus)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    // The key/value pair is written through a narrow view because TypeScript
    // cannot relate `keyof OfflineStatus` to the value type for an indexed
    // assignment. The runtime behaviour is a plain property copy.
    (next as Record<string, unknown>)[key] = value;
    if (!Object.is(snapshot[key], value)) changed = true;
  }
  if (!changed) return;
  snapshot = next;
  emit();
}

/** Back to the startup state. Used by tests and by the clear-data control. */
export function resetOfflineStatus(): void {
  snapshot = { ...initial };
  emit();
}

/* --- Presentation ---------------------------------------------------------
 * One sentence per state, so the banner, the settings card and the status
 * sheet cannot drift into telling the user three different things.
 */

export type StatusTone = "ok" | "info" | "warn" | "error";

export type StatusSummary = {
  tone: StatusTone;
  label: string;
  detail: string;
};

export function summarizeStatus(status: OfflineStatus): StatusSummary | null {
  if (status.storageError) {
    return {
      tone: "error",
      label: "Storage unavailable",
      detail: status.storageError,
    };
  }

  if (status.connection === "offline") {
    if (status.pending > 0) {
      return {
        tone: "warn",
        label: "Offline — changes saved here",
        detail: `${status.pending} change${status.pending === 1 ? "" : "s"} will sync when you are back online.`,
      };
    }
    if (status.prepared === false) {
      return {
        tone: "warn",
        label: "Offline",
        detail: "Schedly has not finished saving itself for offline use.",
      };
    }
    return {
      tone: "info",
      label: "Offline — showing saved data",
      detail: "Everything you see here was saved on this device.",
    };
  }

  if (status.sync === "syncing") {
    return {
      tone: "info",
      label: "Syncing",
      detail:
        status.pending > 0
          ? `Sending ${status.pending} change${status.pending === 1 ? "" : "s"}…`
          : "Checking for changes…",
    };
  }

  if (status.sync === "auth-required") {
    return {
      tone: "warn",
      label: "Sign in to finish syncing",
      detail:
        status.pending > 0
          ? "Your changes are safe on this device and will send once you sign in again."
          : "Your session has expired.",
    };
  }

  if (status.sync === "failed") {
    return {
      tone: "error",
      label: "Not synced",
      detail:
        status.lastError ??
        "Your changes are safe on this device and will be retried automatically.",
    };
  }

  if (status.sync === "blocked") {
    return {
      tone: "warn",
      label: "Sync needs attention",
      detail: "Some changes could not be sent. Tap to review them.",
    };
  }

  if (status.pending > 0) {
    return {
      tone: "info",
      label: `${status.pending} change${status.pending === 1 ? "" : "s"} waiting to sync`,
      detail: "Sending as soon as the connection allows.",
    };
  }

  return null;
}
