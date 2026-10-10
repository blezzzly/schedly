"use client";

import Image from "next/image";
import { useEffect, useSyncExternalStore, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Menu, ArrowLeft, Settings } from "lucide-react";
import { SkipNavigation } from "@/components/skip-navigation";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { GuestStatus } from "@/components/guest-status";
import { NotificationBell } from "@/components/notification-bell";
import { useThemeConfig } from "@/features/theme";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ProfileBottomSheet } from "@/components/profile-bottom-sheet";
import { reportClientType, type ClientType } from "./actions";
import { getUserSchedules } from "@/app/(dashboard)/classes/actions";
import { getUserReminders, scheduleUpcomingReminders, dispatchUserReminders } from "@/app/(dashboard)/reminders/actions";
import { programReminderAlarms } from "@/lib/notification-scheduler";
import { cachedAction } from "@/lib/server-action-cache";
import { subscribeOpen, getOpenSnapshot, setOpen } from "@/lib/sidebar-drawer";
import {
  getNotificationDetailSnapshot,
  subscribeNotificationDetail,
} from "@/lib/notification-detail-store";
import { registerOfflineHandler, startOfflineQueueSync } from "@/lib/offline-queue";
import { OFFLINE_ROUTES, OFFLINE_CACHE_VERSION } from "@/lib/offline-routes";
import { saveSchedule } from "@/app/(dashboard)/classes/actions";
import { createNote } from "@/app/(dashboard)/notes/actions";

// Loaded on demand. The quick-add panel pulls in the whole capture flow
// (ldrs, the review form, the image pipeline), and because the shell renders on
// EVERY dashboard page that weight used to ship in the initial bundle of pages
// that never open it.
const QuickAddSheet = dynamic(
  () => import("@/components/quick-add-sheet").then((m) => m.QuickAddSheet),
  { ssr: false }
);

/* Replay handlers for the offline write queue.
 *
 * Registered at module scope, not in an effect, because a queue entry can be
 * replayed before React has mounted anything — the flush is triggered by the
 * browser's own `online` event and by focus, and an entry that arrived while the
 * app was closed must not be stranded waiting for a component to render.
 *
 * Each handler translates the stored payload back into the same server action
 * the live path uses, so there is exactly one implementation of "create a
 * schedule" and the offline copy cannot drift from the online one.
 */

/** The server answered, and the answer was no. Retrying cannot change that. */
function refused(error: string): Error & { permanent: boolean } {
  return Object.assign(new Error(error), { permanent: true });
}

registerOfflineHandler("schedule.create", async (payload) => {
  const result = await saveSchedule(payload);
  if (!result.success) throw refused(result.error ?? "Schedule was rejected");
});

registerOfflineHandler("note.create", async (payload) => {
  const { title, content, folderId } = payload as {
    title: string;
    content: string;
    folderId: string | null;
  };
  const result = await createNote(title, content, folderId);
  if (!result.success) throw refused(result.error ?? "Note was rejected");
});

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { themeVars } = useThemeConfig();
  const open = useSyncExternalStore(subscribeOpen, getOpenSnapshot, () => false);
  const detailOpen = useSyncExternalStore(
    subscribeNotificationDetail,
    getNotificationDetailSnapshot,
    () => false,
  );
  const showButton = !open;
  const pathname = usePathname();
  const router = useRouter();
  const [avatarError, setAvatarError] = useState(false);
  // Profile sheet state (mobile only) — opened from the top-left avatar button
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  // First-time users are pushed through the setup flow before using the app.
  const { user, isLoading } = useAuth();
  // Stable primitive derived from `user`. The effects below that warm the cache
  // depend on this rather than on `user` itself: `user` can be a fresh object
  // on every render (the offline fallback comes from state), and an effect keyed
  // on it would tear down and re-arm its timer each time — so a 3s delayed task
  // would keep restarting and never run. A string id changes only when the
  // signed-in account actually changes.
  const userId = (user as { id?: string } | null)?.id ?? "";
  // The avatar is warmed into the cache so the user's photo still renders with
  // no connection. Read here rather than inside the effect so the effect can
  // depend on a primitive without also depending on the whole user object.
  const cachedAvatar =
    (user as { image?: string; avatarUrl?: string } | null)?.image
    || (user as { avatarUrl?: string } | null)?.avatarUrl
    || "";
  const userObj = user as { onboardingCompleted?: boolean; emailVerified?: boolean } | null;
  const needsOnboarding =
    !isLoading && user && !userObj?.onboardingCompleted;
  // Email must be verified before the user can enter the app — covers users
  // who still hold a session created before verification was enforced.
  const needsEmailVerification =
    !isLoading && user && userObj?.emailVerified === false;

  const u = user as
    | {
        firstName?: string;
        lastName?: string;
        image?: string;
        avatarUrl?: string;
        isAdmin?: boolean;
      }
    | null
    | undefined;
  const firstName = u?.firstName || "User";
  const lastName = u?.lastName || "";
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials = firstName.charAt(0).toUpperCase();
  const rawAvatar = u?.image || u?.avatarUrl || null;
  // Ensure avatar URL is absolute for Capacitor/PWA origins.
  const resolvedAvatar =
    rawAvatar && !rawAvatar.startsWith("data:") && !rawAvatar.startsWith("http") && rawAvatar.startsWith("/")
      ? `${typeof window !== "undefined" ? window.location.origin : ""}${rawAvatar}`
      : rawAvatar;
  const userAvatar = avatarError ? null : resolvedAvatar;

  // Determine if the avatar is a remote URL that next/image can optimize.
  // Vercel Blob URLs and absolute https URLs are supported.
  // data: URLs, relative paths, blob: URLs, and local upload API URLs must use <img> directly.
  const isRemoteAvatar =
    userAvatar &&
    userAvatar.startsWith("https") &&
    !userAvatar.startsWith("data:") &&
    !userAvatar.startsWith("blob:") &&
    !userAvatar.includes("/api/upload/");

  // Reset the broken-avatar flag when the session's avatar actually changes.
  // Done during render (React's documented "adjust state when props change"
  // pattern) instead of in an effect so the image can retry on a new URL.
  const [prevAvatar, setPrevAvatar] = useState(resolvedAvatar);
  if (resolvedAvatar !== prevAvatar) {
    setPrevAvatar(resolvedAvatar);
    setAvatarError(false);
  }

  // Auto-download offline support: once signed in, warm the cache with every
  // route in the app so each one is available without a connection. The avatar
  // is warmed too so the user's photo still renders without internet.
  //
  // "Done" is only recorded once the worker confirms the pages are cached. The
  // previous version set the flag the instant it posted the message, so a
  // precache cut short — signal dropped, tab backgrounded — was never retried
  // and those pages stayed missing for the rest of the session. Now a partial
  // result leaves the flag unset, so the next app open tries again.
  //
  // Deliberately delayed so it never competes with the first paint.
  useEffect(() => {
    if (!userId || !("serviceWorker" in navigator)) return;
    // Versioned: see OFFLINE_CACHE_VERSION. Without the version this marker
    // survives a cache wipe, so after an upgrade the app would think precaching
    // was already done while the cache held nothing, and every page would be
    // unreachable offline.
    const KEY = `schedly-precached-${OFFLINE_CACHE_VERSION}-${userId}`;
    // Read outside the timer so the effect does not need `user` in its deps.
    const avatar = cachedAvatar;
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      // No sessionStorage (rare) — still precache.
    }
    const timer = setTimeout(() => {
      navigator.serviceWorker.ready
        .then((reg) => {
          const urls = [
            // Every route that must render without a connection. See
            // OFFLINE_ROUTES for why this list is exhaustive rather than
            // best-effort: a page missing from it is a page the user cannot
            // open once the signal drops, with no partial-render fallback.
            //
            // AI-dependent routes are included anyway: their shells render
            // offline, and it is only the upload that cannot run. Excluding them
            // would mean choosing between "the page is there but upload fails"
            // and "the page is not there at all", and the first is honest.
            ...OFFLINE_ROUTES,
            ...(avatar ? [avatar] : []),
          ];

          // A MessageChannel so the worker can report back which pages it could
          // not cache. Without a reply port it still caches everything it can;
          // it just cannot tell us whether to retry on a later open.
          let channel: MessageChannel | null = null;
          try {
            channel = new MessageChannel();
            channel.port1.onmessage = (e: MessageEvent) => {
              const incomplete = (e.data as { incomplete?: string[] })?.incomplete;
              // Only a fully-successful warm is allowed to mark the work done.
              if (Array.isArray(incomplete) && incomplete.length === 0) {
                try {
                  sessionStorage.setItem(KEY, "1");
                } catch {
                  // Best-effort.
                }
              }
              channel?.port1.close();
            };
          } catch {
            // No MessageChannel (very old browser) — proceed unconfirmed.
          }

          reg.active?.postMessage({ type: "PRECACHE", urls }, channel ? [channel.port2] : []);
          // Re-arm pending class-reminder alarms after every app open so they
          // still fire even if the tab/SW was closed since they were set.
          reg.active?.postMessage({ type: "REARM_ALARMS" });
        })
        .catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
    // Keyed on the id, not the user object: see `userId`. An effect depending on
    // an object that is recreated per render restarts its timer forever, so
    // this 3s-delayed warm would never fire at all.
    //
    // `user` is deliberately not a dependency: adding it reintroduces exactly the
    // bug `userId` exists to avoid. The avatar is a display-only extra; if it
    // changes without the account changing, the worst case is one stale photo.
  }, [userId, cachedAvatar]);

  // Warm the cache for whichever page the user is actually on.
  //
  // OFFLINE_ROUTES above covers the fixed routes, but routes with a dynamic
  // segment (/syllabus/[id], /flashcards/[deckId]) cannot be listed ahead of
  // time — the ids live in the database, so there is nothing to fetch until the
  // server can be asked. This caches whichever one the user is on, so a syllabus
  // or deck they open while online is still there when the signal drops.
  //
  // The worker fetches network-first, so this never serves stale HTML while
  // there is a connection — it only decides what is available when there is not.
  useEffect(() => {
    if (!userId || !("serviceWorker" in navigator) || !pathname) return;
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const timer = setTimeout(() => {
      navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage({ type: "PRECACHE", urls: [path] }))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [userId, pathname]);

  // Arm local class-reminder alarms from the service worker on every app open
  // (any dashboard page), not just the Notifications page. Local alarms fire
  // at the exact minute via Notification Triggers (installed PWA) or the SW
  // ticker while the app is open. Exact-time delivery when the app is closed
  // comes from QStash, re-scheduled here (throttled) so edits take effect.
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    let active = true;
    // Deduped: the layout and the pages both fetch schedules/reminders, so
    // these collapse into one request instead of 2-4 per navigation.
    Promise.all([
      cachedAction("layout:schedules", () => getUserSchedules()),
      cachedAction("layout:reminders", () => getUserReminders()),
    ])
      .then(([schedules, reminders]) => {
        if (!active) return;
        if (schedules.length > 0 && reminders.length > 0) {
          programReminderAlarms(schedules as never, reminders as never).catch(() => {});
        }
      })
      .catch(() => {});
    // Refresh exact-time QStash deliveries (5min throttle, no-op until tokens
    // are configured).
    cachedAction("layout:qstash", () => scheduleUpcomingReminders(), 300_000).catch(() => {});
    return () => {
      active = false;
    };
  }, [user, pathname]);

  // Drain the offline write queue. Anything created with no connection lives
  // here until a request succeeds, so this is the only thing standing between a
  // timetable typed on a train and never existing at all.
  //
  // Starts for signed-in users only. A queued write replays through a server
  // action, which needs a session, and replaying as a guest would fail with
  // "Unauthorized" on every entry and mark the good ones as refused.
  useEffect(() => {
    if (!user) return;
    return startOfflineQueueSync();
  }, [user]);

  // Client heartbeat — QStash isn't configured in this deployment, so exact-
  // time class reminders only fire when something checks for them. Poll the
  // dispatcher every 5 min while the app is open (and on every focus/visibility
  // change) so enabled reminders actually go out within a reasonable window.
  // Deduped server-side via lastSentAt/lastStartSentAt, so frequent polling
  // never double-sends.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      // Skip while offline. A dead connection makes every one of these requests
      // fail after a full timeout, so without the check the app fires a
      // guaranteed-failing request on mount, on every focus change, and every
      // five minutes while offline — draining the battery and the rate limit for
      // no chance of a reply. `navigator.onLine` being true does not mean
      // reachable, which is why the call is still wrapped.
      if (!navigator.onLine) return;
      cachedAction("layout:dispatch", () => dispatchUserReminders(), 60_000).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, 300_000);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [user]);

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
    else if (needsEmailVerification && user) {
      const email = encodeURIComponent((user as { email?: string }).email || "");
      router.replace(`/verify-email/pending?email=${email}`);
    }
  }, [needsOnboarding, needsEmailVerification, user, router]);

  // Record what the user is running on (web, PWA on Android/iOS) so the admin
  // dashboard can show each user's device. Runs once per session per type,
  // so it doesn't spam the database.
  useEffect(() => {
    if (!user) return;
    let type: ClientType = "web";
    try {
      const standalone =
        (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
        (navigator as { standalone?: boolean }).standalone === true;
      if (standalone) {
        type =
          /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
            ? "pwa-ios"
            : "pwa-android";
      }
    } catch {
      type = "web";
    }
    const KEY = `schedly-client-${(user as { id?: string }).id ?? ""}`;
    const now = Date.now();
    try {
      const cached = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as {
        type: ClientType;
        at: number;
      } | null;
      if (cached?.type === type && now - cached.at < 6 * 60 * 60 * 1000) return;
      sessionStorage.setItem(KEY, JSON.stringify({ type, at: now }));
    } catch {
      // No sessionStorage (rare) — still report.
    }
    reportClientType(type).catch(() => {});
  }, [user]);
  // The design editor is immersive on mobile: no fixed header, drawer,
  // backdrop, or bottom nav covering it — the canvas fills the screen.
  const isImmersive =
    pathname === "/design" ||
    pathname.startsWith("/flashcards/") && pathname.endsWith("/study");

  // Account settings is a full-screen page — hide the bottom nav there.
  const isSettings = pathname === "/settings";

  // Profile page turns the top-left avatar into a back arrow.
  const isProfile = pathname === "/profile";  // Admin pages are full-screen — same treatment as settings/profile.
  const isAdmin = pathname.startsWith("/admin");

  // The capture flow is a sheet, so there is no /capture route to special-case.

  // Notifications page is opened from the bell icon.
  const isNotifications = pathname === "/notifications";

  // Feedback page is opened from the support section.
  const isFeedback = pathname === "/feedback";

  // Tools pages should show back arrow on mobile (like notifications)
  const isToolsPage =
    pathname === "/notes" ||
    pathname === "/flashcards" ||
    pathname === "/planner" ||
    pathname === "/syllabus" ||
    pathname === "/gwa" ||
    pathname.startsWith("/flashcards/");

  // Close the mobile drawer on every navigation so it never stays open
  // covering a page (e.g., after coming back from the design editor).
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    setOpen(false);
  }, [pathname]);

  // Reset the scroll position on navigation so the next page starts at the
  // top instead of resuming where the previous page left off.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  // The shell always renders: while the session loads, each page shows its
  // own skeletons instead of a full-screen loading state, so a refresh feels
  // like the cards are simply refreshing in place.
  const sidebarWrap = [
    "sidebar-slide fixed right-3 top-16 z-40 w-[262px] max-w-[calc(100vw-1.5rem)] max-h-[80vh] will-change-transform md:hidden",
    open ? "translate-y-0 opacity-100" : "-translate-y-[130%] opacity-0",
  ].join(" ");

  return (
    <div
      className="relative isolate flex min-h-dvh-fallback"
      style={themeVars}
    >
      <SkipNavigation />

      <div className={sidebarWrap} inert={!open}>
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        } ${isImmersive ? "hidden" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Floating menu button — mobile only; on desktop the persistent left
          rail replaces the drawer, so there is nothing to open. */}
      {!isImmersive && showButton && !detailOpen && !profileSheetOpen && !isProfile && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex h-11 w-11 items-center justify-center rounded-xl border-2 border-foreground/70 bg-sidebar text-sidebar-foreground shadow-[3px_3px_0_0_#401f32] transition-colors hover:bg-sidebar md:hidden"
          aria-label="Show sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Floating avatar / back arrow — mobile only. On desktop each page
          header renders its own inline avatar or back arrow. */}
      {!isImmersive && showButton && !detailOpen && !profileSheetOpen && !isProfile && (
        <button
          type="button"
          onClick={() => {
            if (isSettings || isNotifications || isAdmin || isToolsPage) {
              router.push("/dashboard");
            } else if (isFeedback) {
              router.push("/settings?tab=support");
            } else {
              setProfileSheetOpen(true);
            }
          }}
          className="fixed left-4 top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-2 border-foreground/70 bg-sidebar text-sidebar-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-300 hover:bg-sidebar md:hidden"
          aria-label={
            isSettings || isNotifications || isAdmin || isFeedback || isToolsPage
              ? "Go back"
              : "Open profile"
          }
        >
          {isSettings || isNotifications || isAdmin || isFeedback || isToolsPage ? (
            <ArrowLeft className="h-6 w-6" />
          ) : userAvatar ? isRemoteAvatar ? (
            <Image
              src={userAvatar}
              alt={displayName}
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-border/40"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userAvatar}
              alt={displayName}
              onError={() => setAvatarError(true)}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-border/40"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary ring-2 ring-border/40">
              {initials}
            </div>
          )}
        </button>
      )}

      {/* Notification bell — mobile only. */}
      {!isImmersive && showButton && !isNotifications && !detailOpen && !profileSheetOpen && !isProfile && (
        <NotificationBell className="md:hidden" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={[
              "flex-1 scroll-mt-2",
              // Mobile top padding has to clear the two floating buttons, which
              // sit at `top-[safe-area + 1rem]` and are `h-11`, so their bottom
              // edge lands at safe-area + 60px. 4rem gives that 4px of clearance
              // — it can't go lower without them overlapping the content.
              //
              // Desktop had `md:pt-16` (64px) reserving space for a top bar that
              // doesn't exist: the drawer, the menu button, the avatar and the
              // bell are all `md:hidden`, and the desktop nav is `AppNavPanel`,
              // rendered inside the page itself. So those 64px were pure dead
              // space above the content on every screen. `md:pt-6` keeps a small
              // optical margin without the gap.
              isImmersive ? "" : "px-4 pt-[calc(env(safe-area-inset-top)+4rem)] pb-28 sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+4rem)] md:px-8 md:pt-6 md:pb-12",
            ].join(" ")}
          >
          {isImmersive ? (
            <div key={pathname} className="animate-fade-up h-dvh-fallback overflow-y-auto p-0 md:p-6 md:pt-20">
              {children}
            </div>
          ) : (
            <div key={pathname} className="animate-fade-up mx-auto w-full min-w-0 max-w-6xl">{children}</div>
          )}
        </main>
        </div>

      {!isImmersive && !isProfile && !isNotifications && !isSettings && !isAdmin && (
        <BottomNav hidden={open} />
      )}
      {!isImmersive && <OfflineBanner />}

      {/* Guest banner + the sign-in claim that hands a guest's data to a real
          account. Suppressed on the same full-screen pages as the bottom nav. */}
      {!isImmersive && !isProfile && !isNotifications && !isSettings && !isAdmin && (
        <GuestStatus hidden={open} />
      )}

      {/* Quick-add: the capture flow, opened from the bottom nav camera button
          and the "Upload Schedule" empty states. Bottom sheet on mobile,
          centred dialog on desktop. */}
      {!isImmersive && <QuickAddSheet />}

      {/* Draggable profile bottom sheet — mobile only, opened from top-left avatar.
          Suppressed on /profile because that page route renders its own full-screen
          sheet, otherwise they stack on top of each other. */}
      {!isImmersive && !isProfile && (
        <ProfileBottomSheet
          open={profileSheetOpen}
          onClose={() => setProfileSheetOpen(false)}
        />
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
