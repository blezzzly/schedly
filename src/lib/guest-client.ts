/**
 * Client-side tracking of the guest account a device created, so it can be
 * claimed (its data merged into a real account) the moment the user signs up.
 *
 * localStorage rather than a cookie on purpose:
 *  - it survives the full page navigations of the sign-up flow, and
 *  - it is not sent to the server on every request, so a throwaway id is not
 *    an extra identifier riding along on all traffic.
 *
 * The guest id is NOT a credential — the real session lives in the httpOnly
 * better-auth cookie, and claiming still requires an authenticated session.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "schedly-guest-id";

export function readGuestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / storage disabled — no claim, but the guest still works.
    return null;
  }
}

export function writeGuestId(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, userId);
  } catch {
    /* best-effort */
  }
}

export function clearGuestId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
  emit();
}

/* -------------------------------------------------------------------------- */
/* React binding                                                               */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

// Keeps every mounted GuestStatus in sync when one of them clears the marker.
if (typeof window !== "undefined") {
  window.addEventListener("storage", emit);
}

function subscribeGuestId(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getGuestIdSnapshot(): string | null {
  return readGuestId();
}

// Server render + first client render both return null, so the markup matches;
// the real value arrives in the post-hydration snapshot.
function getGuestIdServerSnapshot(): null {
  return null;
}

/** Tell every `useGuestId()` subscriber the marker changed. */
export function notifyGuestIdChanged(): void {
  emit();
}

/**
 * The guest id for this device, hydration-safe.
 *
 * `useSyncExternalStore` rather than `useState(() => readGuestId())`: reading
 * localStorage in an initializer would make the first client render disagree
 * with the server-rendered HTML.
 */
export function useGuestId(): string | null {
  return useSyncExternalStore(subscribeGuestId, getGuestIdSnapshot, getGuestIdServerSnapshot);
}
