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
 *
 * Every key is namespaced to the signed-in account on the way in and out (see
 * `offline-account.ts`), so two people using the same browser never read each
 * other's rows. Keys the app intends to be device-wide use the `meta:` prefix
 * and skip the namespace.
 *
 * Schema history:
 *   v1 — `data`, the key/value cache.
 *   v2 — `queue`, pending writes. Kept the existing installs' cached rows.
 *   v3 — per-account keys, `queue` gains accountId/attempts/backoff fields and
 *        an index for account-scoped reads. Upgrades in place: a user's cached
 *        schedules and unsynced queue survive the upgrade, they simply move
 *        under their own namespace.
 */

import {
  getActiveAccountId,
  isScopedTo,
  LAST_ACCOUNT_KEY,
  readLastAccountId,
  scopeKey,
  setActiveAccountId,
} from "@/lib/offline-account";

export { setActiveAccountId, getActiveAccountId };

const DB_NAME = "schedly-offline";
const STORE = "data";
/** Pending writes waiting for a connection. Keyed by id so they can be removed individually. */
const QUEUE_STORE = "queue";
const DB_VERSION = 3;

/** Queue index for "what is this account waiting on?", without a full scan. */
const QUEUE_ACCOUNT_INDEX = "by-account";

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Raised when the browser refuses a write because storage is full or blocked.
 *
 * Distinct from a generic failure because the recovery is different: retrying
 * changes nothing, the user has to free space or grant permission. Callers
 * surface this as "storage unavailable" rather than "something went wrong".
 */
export class OfflineStorageFullError extends Error {
  readonly quota = true;
  constructor(message = "This device is out of storage space.") {
    super(message);
    this.name = "OfflineStorageFullError";
  }
}

/** True for the DOMException a full or blocked database produces. */
export function isQuotaError(err: unknown): boolean {
  if (err instanceof OfflineStorageFullError) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const from = (event as IDBVersionChangeEvent).oldVersion;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      // Version 2: the queue. Existing installs upgrade in place, so data
      // already cached on a user's device survives.
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }

      // Version 3: per-account reads. `accountId` is absent on entries written
      // by v2, and IndexedDB skips records missing an index key, so they are
      // re-stamped here rather than being left invisible to their own account.
      const queueStore = tx?.objectStore(QUEUE_STORE);
      if (queueStore) {
        if (!db.objectStoreNames.contains(QUEUE_ACCOUNT_INDEX)) {
          queueStore.createIndex(QUEUE_ACCOUNT_INDEX, "accountId", { unique: false });
        }
        if (from < 3) {
          queueStore.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (!cursor) return;
            const entry = cursor.value as { accountId?: string };
            if (!entry.accountId) {
              // Pre-v3 entries were written while an account was signed in, so
              // they belong to whoever is active now. Re-stamping rather than
              // deleting is what keeps a timetable typed offline before the
              // upgrade from disappearing at the upgrade.
              cursor.update({ ...entry, accountId: getActiveAccountId() ?? "-" });
            }
            cursor.continue();
          };
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Another tab is holding an older version open. Without this the promise
    // hangs forever and every cached read never settles, which reads to the UI
    // as an app that loads and then does nothing.
    req.onblocked = () =>
      reject(new Error("Another Schedly tab is open. Close it and reload."));
  });
  // A failed open must not be cached as the connection, or one transient
  // failure disables offline storage for the rest of the session.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** True when IndexedDB can be used at all (private modes sometimes block it). */
export function isOfflineStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
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
    tx.onabort = () => reject(tx.error);
  });
}

/** Persist any value for later offline use (session user, weather, etc.). */
export async function cacheWrite(key: string, value: unknown): Promise<void> {
  await idbPut(scopeKey(key), { value, savedAt: Date.now() });
}

/** Read a value persisted with `cacheWrite`. Returns null when missing. */
export async function cacheRead<T>(key: string): Promise<T | null> {
  const entry = (await idbGet(scopeKey(key)).catch(() => null)) as
    | { value: T; savedAt: number }
    | null
    | undefined;
  return entry?.value ?? null;
}

/** Remove a value persisted with `cacheWrite`. */
export async function cacheRemove(key: string): Promise<void> {
  const db = await openDb();
  const scoped = scopeKey(key);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(scoped);
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
  const scopedKey = cacheKey(key, options);
  try {
    const result = await action();
    try {
      await idbPut(scopeKey(scopedKey), { value: result, savedAt: Date.now() });
    } catch (err) {
      // A full disk must not turn a successful live read into a failure. The
      // caller gets its data; only the offline copy is lost, and the storage
      // banner in Settings is what tells the user about that.
      if (!isQuotaError(err)) throw err;
    }
    return result;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = (await idbGet(scopeKey(scopedKey)).catch(() => null)) as
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

/* --- Storage budget --------------------------------------------------------
 * A phone can run out of room, and a browser can clear storage under pressure.
 * Both are visible before they turn into a silent data-loss bug, so the UI can
 * say "this device is full" instead of a schedule quietly failing to save.
 */

export type StorageInfo = {
  /** Bytes the origin is using, when the browser will say. */
  usage: number | null;
  /** Total bytes available, when the browser will say. */
  quota: number | null;
  /** Whether the origin is protected from automatic eviction. */
  persisted: boolean;
  /** Whether the browser will grant persistence on request. */
  canPersist: boolean;
  available: boolean;
};

/** Ask the browser what space is left. Never throws — an unknown is null. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const base: StorageInfo = {
    usage: null,
    quota: null,
    persisted: false,
    canPersist: false,
    available: isOfflineStorageAvailable(),
  };
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
      base.persisted = await navigator.storage.persisted();
    }
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      base.usage = typeof est.usage === "number" ? est.usage : null;
      base.quota = typeof est.quota === "number" ? est.quota : null;
    }
    base.canPersist =
      typeof navigator !== "undefined" &&
      typeof navigator.storage?.persist === "function";
  } catch {
    // Estimation is best-effort and optional; the UI copes with nulls.
  }
  return base;
}

/**
 * Ask the browser to keep this origin's data.
 *
 * Without it the browser may evict the cache and the unsynced queue under
 * storage pressure — silently, and with no warning to the app. Browsers grant
 * this to installed PWAs and to sites the user has engaged with, so it can
 * legitimately be refused; that is fine and reported honestly rather than
 * retried. Called once on first offline preparation, not on every load.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Erase everything stored locally for one account.
 *
 * The deliberate escape hatch for a shared device, and the only thing that
 * destroys data — signing out deliberately does not call this, because it would
 * discard unsynchronised work the spec says to preserve. Unsigned-in usage is
 * untouched because the data was never theirs to keep.
 */
export async function clearAccountData(accountId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, QUEUE_STORE], "readwrite");
    const data = tx.objectStore(STORE);
    data.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) return;
      if (isScopedTo(String(cursor.key), accountId)) cursor.delete();
      cursor.continue();
    };
    const queue = tx.objectStore(QUEUE_STORE);
    queue.openCursor().onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) return;
      if ((cursor.value as { accountId?: string })?.accountId === accountId) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Restore the account scope saved on this device.
 *
 * Runs before the first cached read so an offline launch knows whose data to
 * show. Called by `useAuth`; exported for tests, which have no session.
 */
export async function restoreAccountScope(): Promise<string | null> {
  const last = await readLastAccountId((key) => idbGet(key));
  if (last) setActiveAccountId(last);
  return last;
}

/**
 * Remember which account this device is pointed at, unscoped.
 *
 * Stores the id and nothing else. It exists so an offline launch can restore
 * the right scope before the session resolves; putting the profile itself here
 * would hand it to whoever signs in next.
 */
export async function persistAccountPointer(accountId: string | null): Promise<void> {
  if (accountId) {
    setActiveAccountId(accountId);
    try {
      await idbPut(LAST_ACCOUNT_KEY, {
        value: { accountId },
        savedAt: Date.now(),
      });
    } catch {
      // Losing the pointer costs a colder offline start, nothing more.
    }
  }
}

/* --- Queue store ---------------------------------------------------------
 * Raw accessors for the pending-write queue. The queue semantics live in
 * `offline-queue.ts`; these are only the IndexedDB plumbing, kept here so there
 * is one connection to one database.
 */

/** The pending-write row, as stored. */
export type QueueRow = {
  id: string;
  kind: string;
  label: string;
  payload: unknown;
  createdAt: number;
  /** Owner. A queue entry is never replayed for a different account. */
  accountId: string | null;
  /** How many times sending has been tried. Drives the backoff. */
  attempts: number;
  /** Epoch ms before which no retry should be attempted. */
  nextAttemptAt: number;
  /** Stable key sent to the server so a retry cannot create a second copy. */
  idempotencyKey?: string;
  /** Last failure, shown in the sync status sheet. */
  lastError?: string;
};

/** Append a pending write. Entries carry their own id as the key. */
export function queuePut(entry: { id: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb().then(
      (db) => {
        const tx = db.transaction(QUEUE_STORE, "readwrite");
        tx.objectStore(QUEUE_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      },
      reject
    );
  });
}

/**
 * Every pending write for one account, oldest first.
 *
 * Filtered by the account index rather than by scanning everything, so a
 * device that has held several accounts does not replay (or display) another
 * one's writes. Passing `null` reads the whole queue — settings and tests only.
 */
export function queueGetAll<T>(accountId?: string | null): Promise<T[]> {
  const owner = accountId === undefined ? getActiveAccountId() : accountId;
  return new Promise<T[]>((resolve, reject) => {
    openDb().then(
      (db) => {
        const tx = db.transaction(QUEUE_STORE, "readonly");
        const store = tx.objectStore(QUEUE_STORE);
        // One request either way. The account index is a primary-key lookup on
        // the owning column, so it is not slower than the full scan and is the
        // only variant that can honour the isolation rule.
        const req: IDBRequest<T[]> =
          owner == null
            ? store.getAll()
            : store.index(QUEUE_ACCOUNT_INDEX).getAll(IDBKeyRange.only(owner));
        req.onsuccess = () => {
          const rows = (req.result ?? []) as T[];
          rows.sort(
            (a, b) =>
              ((a as { createdAt?: number }).createdAt ?? 0) -
              ((b as { createdAt?: number }).createdAt ?? 0)
          );
          resolve(rows);
        };
        req.onerror = () => reject(req.error);
      },
      reject
    );
  });
}

/** Drop one pending write, by id. */
export function queueDelete(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb().then(
      (db) => {
        const tx = db.transaction(QUEUE_STORE, "readwrite");
        tx.objectStore(QUEUE_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      },
      reject
    );
  });
}

/** Write back the retry bookkeeping on one entry. */
export function queuePatch(
  id: string,
  patch: Partial<QueueRow>
): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb().then(
      (db) => {
        const tx = db.transaction(QUEUE_STORE, "readwrite");
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.get(id);
        req.onsuccess = () => {
          const current = req.result as QueueRow | undefined;
          if (!current) return;
          store.put({ ...current, ...patch });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      },
      reject
    );
  });
}

/** How many writes are waiting. Used for the "waiting to sync" indicator. */
export async function queueCount(): Promise<number> {
  const rows = await queueGetAll<unknown>().catch(() => []);
  return rows.length;
}
