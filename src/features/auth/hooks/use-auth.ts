"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { retry } from "@/lib/retry";
import { useMounted } from "@/lib/use-mounted";
import {
  cacheRead,
  cacheRemove,
  cacheWrite,
  isNetworkError,
  isOffline,
  persistAccountPointer,
  restoreAccountScope,
} from "@/lib/offline-cache";
import { refreshPendingCount } from "@/lib/offline-queue";

type CachedUser = Record<string, unknown> & {
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  image?: string;
};

export function useAuth() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  // better-auth's useSession hydrates from cookies client-side only, so the
  // server renders a session-less tree. Deferring the session until after
  // mount keeps SSR and the first client render identical (no hydration
  // mismatch), and the name still appears instantly once mounted.
  const mounted = useMounted();
  const router = useRouter();

  // Offline fallback: persist the signed-in user so the greeting, name, and
  // avatar still show without a connection. The session fetch fails offline,
  // so server-rendered pages would otherwise fall back to "there" and a
  // missing photo. We fall back on any network failure, not just
  // navigator.onLine === false — on Android (Wi-Fi with no internet, mobile
  // data with no signal) the browser still reports online while every
  // request fails.
  const [offlineUser, setOfflineUser] = useState<CachedUser | null>(null);
  const [offlineSettled, setOfflineSettled] = useState(false);

  const resolvedSession = mounted ? session : null;
  const user = resolvedSession?.user ?? offlineUser;

  // Point the local database at the right account before anything reads or
  // writes it. Runs once, before the effects below, because those effects cache
  // the session under whatever scope is active — get this wrong and one
  // account's profile lands in another's namespace, which is the exact leak the
  // scoping exists to prevent.
  const sessionUserId = (resolvedSession?.user as { id?: string } | undefined)?.id ?? "";

  useEffect(() => {
    if (!mounted) return;
    restoreAccountScope()
      .catch(() => null)
      .then(() => {
        // With no session we keep whatever scope the device recorded, so an
        // offline launch still shows the signed-in user's own cached data —
        // never another account's, because every read is namespaced.
        if (sessionUserId) persistAccountPointer(sessionUserId).catch(() => {});
      });
    // Keyed on the id rather than the user object: better-auth hands back a
    // fresh object each render, and an effect depending on one would re-run
    // forever, re-opening the database on every frame.
  }, [mounted, sessionUserId]);

  useEffect(() => {
    if (!mounted) return;
    if (resolvedSession?.user) {
      const u = resolvedSession.user as CachedUser;
      cacheWrite("session:user", {
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        image: u.image,
      }).catch(() => {});
      return;
    }
    if (!isPending && (isOffline() || isNetworkError(error))) {
      cacheRead<CachedUser>("session:user")
        .then((cached) => {
          if (cached) {
            setOfflineUser(cached);
            // Reconcile greeting with the possibly-stale cached photo.
            setOfflineSettled(true);
          }
        })
        .catch(() => {})
        .finally(() => setOfflineSettled(true));
      return;
    }
    if (!isPending && (error == null || (error as { status?: number }).status === 401)) {
      // The server confirmed there's no session (or it expired): drop any
      // stale cached session so it can't "log back in" when offline.
      //
      // Only the session copy is removed. The user's schedules, notes and
      // queued writes stay: an expired session is not a reason to destroy
      // unsynchronised work, and the user is very likely to sign back in and
      // expect their timetable to still be there.
      cacheRemove("session:user")
        .catch(() => {})
        .then(() => setOfflineUser(null));
    }
  }, [mounted, resolvedSession, isPending, error]);

  const signUp = useCallback(
    async (data: {
      email: string;
      firstName: string;
      lastName: string;
      password: string;
      school?: string;
      course?: string;
      year?: string;
    }) => {
      try {
        const result = await retry(() => authClient.signUp.email({
          ...data,
          name: `${data.firstName} ${data.lastName}`,
          year: data.year && !isNaN(Number(data.year)) ? Number(data.year) : undefined,
          callbackURL: "/verify-email/success",
        } as Parameters<typeof authClient.signUp.email>[0]));
        return result;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        return { data: null, error: { message } };
      }
    },
    []
  );

  const signIn = useCallback(
    async (data: { email: string; password: string }) => {
      try {
        const result = await retry(() => authClient.signIn.email({
          email: data.email,
          password: data.password,
          callbackURL: "/dashboard",
        }));
        return result;
      } catch (err: unknown) {
        // better-auth's client may throw on unexpected status codes (423
        // locked, 429 rate-limited, network errors) instead of returning
        // { error }. Convert those into the same shape the login form expects
        // so the existing error-message logic can handle them.
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        return { data: null, error: { message } };
      }
    },
    []
  );

  const signInSocial = useCallback(
    async (provider: "google" | "github") => {
      // disableRedirect: the server returns the provider URL as JSON instead
      // of a 302. Our fetch can't follow the 302 to Google/GitHub because the
      // CSP connect-src doesn't allow those hosts — so we navigate manually.
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/dashboard",
        newUserCallbackURL: "/dashboard",
        disableRedirect: true,
      });
      // better-auth client returns `{ data, error }`.
      const data = (result as { data?: { url?: string } }).data;
      const error = (result as {
        error?: string | { code?: string; message?: string };
      }).error;
      return { url: data?.url, error };
    },
    []
  );

  const signOut = useCallback(async () => {
    const accountId = (user as { id?: string } | null)?.id ?? null;
    await authClient.signOut();
    // Clear the cached session so it can't resurrect the user offline.
    setOfflineUser(null);
    cacheRemove("session:user").catch(() => {});

    // Everything else that account saved stays on the device, but it is now
    // unreachable: every read and write is namespaced by account, and the
    // queue is filtered by it too, so whoever signs in next cannot see it or
    // replay it. Deleting instead would throw away a timetable typed on a train
    // that has not reached the server yet, which is precisely the work this
    // whole feature exists to protect.
    //
    // A device that is genuinely shared is a different situation, and Settings
    // has an explicit control for it that does erase everything.
    if (accountId) {
      // Recount so the pending badge does not keep showing the previous
      // account's queue to somebody who has not signed in yet.
      void refreshPendingCount().catch(() => {});
    }

    router.push("/login");
  }, [router, user]);

  const forgotPassword = useCallback(
    async (email: string) => {
      try {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        return result;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        return { data: null, error: { message } };
      }
    },
    []
  );

  return {
    user: user ?? null,
    session: resolvedSession ?? null,
    // Offline: the session fetch fails, but we're "settled" once the cache
    // has been checked — pages then render the cached user instead of
    // spinning forever.
    isLoading: !mounted || (isPending && !offlineSettled),
    isAuthenticated: !!resolvedSession || !!offlineUser,
    refetchSession: refetch,
    signUp,
    signIn,
    signInSocial,
    signOut,
    forgotPassword,
  };
}
