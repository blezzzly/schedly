/* Which account the local database currently belongs to.
 *
 * Schedly stores a copy of your schedules, notes, todos and profile on the
 * device so they still open on a train. Those records are private, and a
 * browser profile is not necessarily a private one — a shared laptop, a phone
 * passed around the class, a family tablet. Before this module the cache keys
 * were plain strings ("schedule:list", "session:user"), so every account on the
 * device read and wrote the same rows. Signing out and signing in as somebody
 * else showed the previous user's timetable, which is exactly the leak §11 of
 * the offline spec forbids.
 *
 * The fix is to make the account part of every key, so one account's rows are
 * simply not addressable from another. That is isolation rather than deletion,
 * and the distinction matters: work the previous user typed on a train and has
 * not synced yet is still theirs when they sign back in. Deleting it would
 * throw away unsynchronised data, which the spec explicitly says not to do.
 * A shared device is handled by the explicit "clear offline data" control in
 * Settings, which is the only thing that erases anything.
 *
 * Kept free of IndexedDB so the scoping rules can be tested directly. The
 * database side lives in `offline-cache.ts`, which calls into here.
 */

/**
 * Keys that are deliberately NOT scoped to an account.
 *
 * These hold app-wide, non-personal state: which account was last signed in on
 * this device, offline-readiness markers, the Low Data Mode preference. None of
 * them are private user data, and all of them have to be readable *before* the
 * account is known — that is the whole reason they live outside the scope.
 */
export const UNSCOPED_PREFIX = "meta:";

/**
 * Pointer to the last signed-in account, stored unscoped.
 *
 * Needed to bootstrap scope: offline, `useSession` fails, so the app has to
 * decide which account's cached schedule to render before it knows who anyone
 * is. It holds the account id and nothing else — an opaque UUID, no email, no
 * name, no schedule. With it the app restores the right scope and then reads
 * that account's data through the scoped path like everything else.
 */
export const LAST_ACCOUNT_KEY = "meta:last-account";

let activeAccountId: string | null = null;

/**
 * Point the local database at one account.
 *
 * Passing `null` puts it in the unscoped mode used before sign-in. Callers
 * must re-establish the account whenever the session changes; `useAuth` does
 * this on every session resolution.
 */
export function setActiveAccountId(id: string | null): void {
  activeAccountId = id || null;
}

/** The account the local database is currently pointed at. */
export function getActiveAccountId(): string | null {
  return activeAccountId;
}

/**
 * Namespace a cache key to the active account.
 *
 * Two accounts asking for "schedule:list" get two different rows, so neither
 * can observe the other. Unknown-account keys still get a namespace, rather
 * than sharing one "anonymous" bucket, because a shared anonymous bucket is
 * precisely the leak this module exists to close.
 */
export function scopeKey(key: string): string {
  if (key.startsWith(UNSCOPED_PREFIX)) return key;
  return `a:${activeAccountId ?? "-"}:${key}`;
}

/** True when `scoped` belongs to `accountId`. Used to delete on sign-out. */
export function isScopedTo(scoped: string, accountId: string): boolean {
  return scoped.startsWith(`a:${accountId}:`);
}

/**
 * The account id recorded on this device, if any.
 *
 * Stored unscoped and read before the session is known, purely to restore the
 * scope. Resolves to `null` on a device that has never been signed in.
 */
export async function readLastAccountId(
  read: (key: string) => Promise<unknown>
): Promise<string | null> {
  try {
    const raw = (await read(LAST_ACCOUNT_KEY)) as
      | { value?: { accountId?: string } }
      | null
      | undefined;
    const id = raw?.value?.accountId;
    return typeof id === "string" && id ? id : null;
  } catch {
    // A blocked or corrupt database must not stop the app from starting.
    return null;
  }
}
