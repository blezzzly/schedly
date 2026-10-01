/**
 * Guest ("continue without an account") support.
 *
 * A guest is a REAL row in `users` with a throwaway email in the
 * `guest.schedly.app` domain, a real better-auth session, and `isAnonymous`
 * set. They can use the whole app; they just can't be signed into again once
 * the session cookie is cleared, which is why `claimGuestAccount()` exists to
 * hand their data to a real account.
 *
 * Why a real user row instead of a null userId: every model holding app data
 * (Schedule, Class, Upload, Reminder, ...) has a REQUIRED `userId` FK, and
 * `src/proxy.ts` redirects any request without a session cookie to /login.
 * A row + session is what makes the rest of the app work unchanged.
 */

import { GUEST_EMAIL_DOMAIN, isGuestEmail } from "./guest-identity";
import { isGuestName, pickGuestName } from "@/features/guest/persona";

export { GUEST_EMAIL_DOMAIN, isGuestEmail };

/** How many AI generations a guest may run before we ask them to sign up. */
export const GUEST_AI_LIMIT = 2;

/** Sentinel error code. `friendlyError()` maps it to user-facing copy. */
export const GUEST_AI_LIMIT_REACHED = "GUEST_AI_LIMIT_REACHED";

export class GuestAiLimitError extends Error {
  constructor() {
    super(GUEST_AI_LIMIT_REACHED);
    this.name = "GuestAiLimitError";
  }
}

/**
 * Create a guest user and a signed-in session, returning the `Set-Cookie`
 * headers the caller must copy onto its own response.
 *
 * Built entirely on better-auth's PUBLIC api (`signUpEmail` then
 * `signInEmail`) rather than `auth.$context.internalAdapter`, because the
 * latter has no `responseHeaders`/`setSignedCookie` outside a request handler —
 * so there would be no way to actually hand the browser its cookie. The public
 * endpoints run the full pipeline (databaseHooks, password hashing, session
 * creation) and return a real Response we can read cookies off.
 *
 * Two steps are needed because `requireEmailVerification` is enabled on any
 * deploy that has RESEND_API_KEY, and better-auth deliberately skips auto
 * sign-in on `signUpEmail` in that mode — so the first call creates the user
 * and no session. We then flip `emailVerified` (there is no mailbox to
 * verify, and the dashboard layout would otherwise bounce the guest to
 * /verify-email/pending) and sign in, which is not gated.
 */
export async function createGuestSession(opts: { name?: string } = {}): Promise<{
  userId: string;
  handle: string;
  name: string;
  setCookies: string[];
}> {
  // `auth` and `db` stay dynamic so importing this module doesn't drag the
  // database client (and a connection) into every bundle that only needs the
  // constants above. `allocateGuestHandle` is a sibling in THIS module, so it
  // is called directly — it used to be pulled in via a self-import, which is
  // just a cycle waiting to hand back a partially-initialised binding.
  const [{ auth }, { db }] = await Promise.all([
    import("@/server/lib/auth"),
    import("@/server/db/client"),
  ]);

  // Only names from our own list are accepted; anything else falls back to a
  // server-side pick. Keeps arbitrary strings out of a user row.
  const requested = isGuestName(opts.name) ? opts.name : null;
  // Seeded from a fresh UUID, not from the handle: the handle is now derived
  // FROM the name, so it can no longer seed it without circularity.
  const name = requested ?? pickGuestName(crypto.randomUUID());

  // Handle derived from the chosen name, so the guest's own profile reads
  // "@guestNikolai" rather than "@guest7643".
  const handle = await allocateGuestHandle(name);
  // Must be lower case. better-auth normalises the sign-up email to lower case
  // before storing it, so `guestNikolai@guest.schedly.app` and
  // `guestNikolai@...` are different strings — and the lookup below runs on
  // whatever we build here. The old all-numeric handles were lower case
  // already, which is why this never surfaced before name-derived handles
  // introduced an upper-case letter.
  const email = `${handle.toLowerCase()}@${GUEST_EMAIL_DOMAIN}`;

  // Random and never stored: there is no Account-less sign-in, so this can
  // never be used to authenticate as the guest later.
  const password = `${crypto.randomUUID()}Aa1!`;

  const signUp = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
      username: handle,
      firstName: name,
      lastName: "",
    } as never,
    asResponse: true,
  });

  if (!signUp.ok) {
    throw new Error(`Guest sign-up failed with status ${signUp.status}`);
  }

  // Resolve by username, which better-auth stores exactly as sent, rather than
  // by email, which it lower-cases. Resilient on purpose: `signUp.ok` only means
  // better-auth returned 2xx, not that the row landed where we asked for it.
  const created = await db.user.findUnique({
    where: { username: handle },
    select: { id: true },
  });
  if (!created) {
    // Don't leak a half-created account. The old code threw here and left the
    // row behind — an unusable user (the password is discarded and never
    // stored) that still counted as a real account in the admin dashboard.
    // Cleaning up by username too, since the email may be stored re-cased.
    await db.user
      .deleteMany({ where: { OR: [{ username: handle }, { email }] } })
      .catch(() => undefined);
    throw new Error("Guest sign-up did not create a user row");
  }

  await db.user.update({
    where: { id: created.id },
    data: {
      emailVerified: true,
      isAnonymous: true,
      // Skip the username/avatar setup flow — a guest has no identity to build.
      onboardingCompleted: true,
    },
  });

  const signIn = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });

  if (!signIn.ok) {
    // Don't leave an orphan user behind if the session can't be minted.
    await db.user.delete({ where: { id: created.id } }).catch(() => undefined);
    throw new Error(`Guest sign-in failed with status ${signIn.status}`);
  }

  return {
    userId: created.id,
    handle,
    name,
    setCookies: signIn.headers.getSetCookie?.() ?? [],
  };
}

/**
 * Claim an unused guest handle.
 *
 * The handle is derived from the name the guest picked — `guestNikolai`, then
 * `guestNikolai2`, `guestNikolai3` on clash — so it reads as a label for a
 * person instead of a row id. A random number (`guest7643`) told the user
 * nothing and looked like a database dump on their own profile.
 *
 * Collisions are expected, not exceptional: there are only ~68 names in the
 * pool, so two guests picking "Juan" is normal. The suffix walk resolves it
 * against the database rather than guessing, and the numeric range remains only
 * as the fallback for a name that sanitizes down to nothing.
 *
 * Sanitizing to letters keeps the handle usable as a username and as the local
 * part of the throwaway email; every name in the pool is already plain ASCII,
 * so this is belt-and-braces rather than load-bearing.
 */
export async function allocateGuestHandle(name?: string | null): Promise<string> {
  const { db } = await import("@/server/db/client");

  const taken = async (handle: string) =>
    Boolean(
      await db.user.findFirst({
        where: { OR: [{ id: handle }, { username: handle }] },
        select: { id: true },
      }),
    );

  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 16);

  if (base) {
    for (let n = 1; n <= 99; n++) {
      const handle = n === 1 ? `guest${base}` : `guest${base}${n}`;
      if (!(await taken(handle))) return handle;
    }
  }

  // Fall back to a wide random space rather than failing the request outright.
  for (let attempt = 0; attempt < 12; attempt++) {
    const handle = `guest${1000 + Math.floor(Math.random() * 9000)}`;
    if (!(await taken(handle))) return handle;
  }

  return `guest${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/**
 * Reserve one unit of a guest's AI allowance. Throws `GuestAiLimitError` once
 * the guest is out. A no-op for signed-in users.
 *
 * Called from the single AI choke point (`generateWithFallback`) so every AI
 * path is covered without each caller having to remember.
 */
export async function consumeGuestAiAllowance(userId: string): Promise<void> {
  const { db } = await import("@/server/db/client");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAnonymous: true, guestAiUsed: true },
  });

  // Unknown user (stale cookie cache) or a real account — nothing to meter.
  if (!user?.isAnonymous) return;

  if (user.guestAiUsed >= GUEST_AI_LIMIT) {
    throw new GuestAiLimitError();
  }

  // Conditional update so two parallel uploads can't both slip past the check.
  await db.user.updateMany({
    where: { id: userId, guestAiUsed: { lt: GUEST_AI_LIMIT } },
    data: { guestAiUsed: { increment: 1 } },
  });
}
