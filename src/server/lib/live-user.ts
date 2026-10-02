import { db } from "@/server/db/client";

/**
 * Resolve a session's user id to a row that actually exists.
 *
 * better-auth's cookie cache keeps a session readable for up to 7 days even
 * after the underlying user row is gone (account deleted, a guest cleaned up,
 * a test fixture removed). Any write that then uses that id violates the
 * foreign key and Prisma throws `P2003`, which surfaces to the client as an
 * opaque 500.
 *
 * Returns `null` when the session is missing OR the user is gone, so callers
 * can treat both as the same thing: not signed in.
 */
export async function resolveLiveUserId(sessionUserId: string | undefined | null): Promise<string | null> {
  if (!sessionUserId) return null;
  const user = await db.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true },
  });
  return user?.id ?? null;
}
