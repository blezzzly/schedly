"use client";

/* Low Data Mode.
 *
 * Schedly is mostly text and a timetable, so it is already light. What it is
 * not light on is the *number* of requests: a dashboard pulls schedules,
 * reminders, notifications and widgets, a layout warms the same schedules again
 * for the reminder alarms, and each of those runs on mount, on focus and on a
 * timer. On a phone where every megabyte is being counted, that repetition is
 * the cost — not any single response.
 *
 * Low Data Mode turns the repetition off. It is a user setting rather than a
 * detection, because someone on an unlimited plan on a train is better served
 * by the app assuming nothing about their data. The browser's own signals
 * (`navigator.connection.saveData` and `effectiveType`) are honoured as well,
 * because a user who turned on Data Saver in their OS did exactly this and
 * should not have to find the setting too.
 *
 * What it does NOT do: hide features. A schedule still syncs, a syllabus still
 * downloads, nothing is silently withheld to save bytes. It changes *when* and
 * *how much* is fetched, never *whether* the app works. And it makes no claim
 * about free mobile data — zero-rating is a carrier agreement, not something
 * this app can provide or detect.
 */

const STORAGE_KEY = "schedly:low-data";

/** Device-level preference, so it survives sign-out and applies before login. */
const PREF_KEY = "meta:low-data";

type Listener = () => void;

const listeners = new Set<Listener>();

function readPref(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage blocked (private mode). Default to off rather than guessing.
    return false;
  }
}

let userPreference = readPref();

function writePref(on: boolean): void {
  userPreference = on;
  try {
    localStorage?.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Preference is still applied in memory for this session.
  }
  // Mirror into the offline store so the Settings screen can read it through
  // the same path as everything else it shows about the device.
  import("@/lib/offline-cache").then(
    ({ cacheWrite }) => cacheWrite(PREF_KEY, { enabled: on }).catch(() => {}),
    () => {}
  );
  listeners.forEach((l) => l());
}

/** The browser's Network Information API, when the browser has one. */
export type ConnectionInfo = {
  /** True when the OS or browser asked sites to minimise data. */
  saveData: boolean;
  /** "slow-2g" | "2g" | "3g" | "4g" | undefined. Coarse and often absent. */
  effectiveType: string | null;
  online: boolean;
};

function connection(): (Navigator & { connection?: unknown })["connection"] | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void };
    mozConnection?: unknown;
    webkitConnection?: unknown;
  };
  return (nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null) as
    | (Navigator & { connection?: unknown })["connection"]
    | null;
}

/** Current network hints. Unknown fields are `null`/false, never guessed. */
export function getConnectionInfo(): ConnectionInfo {
  const c = connection() as
    | { saveData?: boolean; effectiveType?: string }
    | null;
  return {
    saveData: c?.saveData === true,
    effectiveType: typeof c?.effectiveType === "string" ? c.effectiveType : null,
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  };
}

/** True when the connection is one where a large download is unwelcome. */
export function isSlowConnection(): boolean {
  const t = getConnectionInfo().effectiveType;
  return t === "slow-2g" || t === "2g" || t === "3g";
}

/** Whether the user asked for Low Data Mode in Settings. */
export function isLowDataEnabled(): boolean {
  return userPreference;
}

/**
 * Whether to actually economise: the user's setting, or the browser/OS asking.
 *
 * The OS signal alone is enough to act on, because honouring it is what the
 * user already asked for somewhere else. Settings stays the way to turn the
 * behaviour on deliberately, and to see that it is on.
 */
export function shouldSaveData(): boolean {
  return isLowDataEnabled() || getConnectionInfo().saveData || isSlowConnection();
}

/** Turn Low Data Mode on or off and tell anything listening. */
export function setLowDataEnabled(on: boolean): void {
  if (on === userPreference) return;
  writePref(on);
}

/** Subscribe to preference changes. Returns an unsubscribe function. */
export function subscribeLowData(listener: Listener): () => void {
  listeners.add(listener);
  const c = connection() as {
    addEventListener?: (type: string, l: () => void) => void;
    removeEventListener?: (type: string, l: () => void) => void;
  } | null;
  c?.addEventListener?.("change", listener);
  return () => {
    listeners.delete(listener);
    c?.removeEventListener?.("change", listener);
  };
}

/** Server snapshot, for tests and for the first render before hydration. */
export function getLowDataSnapshot(): boolean {
  return userPreference;
}

/* --- What the setting actually changes -------------------------------------
 * Kept as small named decisions rather than scattered `if (lowData)` checks, so
 * the effect of the setting can be read in one place and tested without a
 * browser.
 */

/**
 * Whether to auto-refresh data on an interval.
 *
 * The alternative is not "no data" — every screen keeps a manual refresh
 * control, and pulling to refresh still works. It is that the app stops
 * spending the user's data to redraw something they are not currently looking
 * at. Polling is the single largest avoidable cost in this app.
 */
export function shouldAutoRefresh(): boolean {
  return !shouldSaveData();
}

/** Interval for background refreshes, in ms. `null` means do not poll at all. */
export function refreshIntervalMs(baseMs: number): number | null {
  return shouldAutoRefresh() ? baseMs : null;
}

/**
 * Whether to spend bytes warming optional resources (avatars, weather icons,
 * non-essential images) before they are actually needed.
 *
 * Core shell assets are unaffected — precaching those is what makes the app
 * open at all without a connection, and skipping it would trade a small
 * one-time cost for the whole feature.
 */
export function shouldPrefetchOptional(): boolean {
  return !shouldSaveData();
}

/**
 * Whether a search box should query as the user types.
 *
 * Every keystroke that reaches the server is a request. Off means the user
 * presses Enter or taps Search, which is a behaviour change they opted into by
 * turning the setting on.
 */
export function shouldSearchAsYouType(): boolean {
  return !shouldSaveData();
}

/**
 * How long to wait after the last keystroke before searching, in ms.
 *
 * A function rather than a constant: the preference can change at runtime, and a
 * value read once at module load would keep the old answer for the rest of the
 * session. With the setting on, the user submits instead, so there is nothing to
 * debounce and any wait would only add latency.
 */
export function searchDebounceMs(): number {
  return shouldSaveData() ? 0 : 250;
}

/** Page size for lists that can grow large. */
export function pageSize(preferred: number): number {
  return shouldSaveData() ? Math.min(preferred, 10) : preferred;
}

/**
 * Image size to request.
 *
 * Returns a hint for `next/image` `sizes` so a phone is sent a phone-sized
 * asset rather than a desktop one. Halving the width is a quarter of the
 * bytes; the browser already scales, so nothing is lost visually at 2x density
 * beyond a slightly softer edge on non-essential art.
 */
export function imageSizeHint(desktopWidth: number): string {
  return shouldSaveData()
    ? `(max-width: 768px) ${Math.round(desktopWidth / 2)}px, ${desktopWidth}px`
    : "(max-width: 768px) 100vw, 768px";
}

/**
 * Whether a sync is allowed to start without asking.
 *
 * The user can always sync manually. This only governs the automatic attempts,
 * which are the ones that can fire repeatedly on a metered connection.
 */
export function shouldAutoSync(): boolean {
  return true;
}
