"use client";

/* Offline data cache — IndexedDB-backed fallback so the app keeps showing
 * the user's data when the network drops.
 *
 * Usage:
 *   const data = await withOfflineCache("schedule:list", () => getUserSchedules());
 *
 * While online the action runs normally and its result is written to the
 * cache. When the network fails, the last cached copy is returned instead
 * of letting the UI hang on a spinner.
 */

const DB_NAME = "schedly-offline";
const STORE = "data";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkError(err: unknown): boolean {
  const walk = (e: unknown): boolean => {
    if (e instanceof TypeError) return true;
    if (e instanceof Error) {
      const msg = (e.message || "").toLowerCase();
      if (
        e.name === "FetchError" ||
        e.name === "TypeError" ||
        msg === "network error" ||
        msg.includes("fetch failed") ||
        msg.includes("failed to fetch") ||
        msg.includes("network")
      ) {
        return true;
      }
      // BetterFetchError wraps the underlying TypeError in `cause`.
      if (e.cause && e.cause !== e) return walk(e.cause);
    }
    return false;
  };
  return walk(err);
}

/** Persist any value for later offline use (session user, weather, etc.). */
export async function cacheWrite(key: string, value: unknown): Promise<void> {
  await idbPut(key, { value, savedAt: Date.now() });
}

/** Read a value persisted with `cacheWrite`. Returns null when missing. */
export async function cacheRead<T>(key: string): Promise<T | null> {
  const entry = (await idbGet(key).catch(() => null)) as
    | { value: T; savedAt: number }
    | null
    | undefined;
  return entry?.value ?? null;
}

/** Remove a value persisted with `cacheWrite`. */
export async function cacheRemove(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Run `action`; on network failure serve the last cached value for `key`. */
export async function withOfflineCache<T>(
  key: string,
  action: () => Promise<T>,
  options?: { cacheName?: string; ttlMs?: number }
): Promise<T> {
  try {
    const result = await action();
    try {
      await idbPut(cacheKey(key, options), { value: result, savedAt: Date.now() });
    } catch {
      // Cache writes must never break the live action result.
    }
    return result;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = (await idbGet(cacheKey(key, options)).catch(() => null)) as
      | { value: T; savedAt: number }
      | null
      | undefined;
    if (cached?.value != null) {
      if (options?.ttlMs != null && Date.now() - cached.savedAt > options.ttlMs) {
        throw err;
      }
      return cached.value;
    }
    throw err;
  }
}

function cacheKey(key: string, options?: { cacheName?: string }): string {
  return options?.cacheName ? `${options.cacheName}:${key}` : key;
}
