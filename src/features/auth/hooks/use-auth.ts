"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { retry } from "@/lib/retry";
import { useMounted } from "@/lib/use-mounted";
import { cacheRead, cacheRemove, cacheWrite, isNetworkError, isOffline } from "@/lib/offline-cache";

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
    await authClient.signOut();
    // Clear the cached session so it can't resurrect the user offline.
    setOfflineUser(null);
    cacheRemove("session:user").catch(() => {});
    router.push("/login");
  }, [router]);

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
