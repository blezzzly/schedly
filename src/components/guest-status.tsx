"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useGuestId, clearGuestId, notifyGuestIdChanged } from "@/lib/guest-client";
import { useMounted } from "@/lib/use-mounted";
import { claimGuestAccount } from "@/app/(dashboard)/guest/actions";

/**
 * Stores the guest id whose banner was dismissed, so the nudge comes back for a
 * *new* guest session but stays gone for this one. Tying it to the id rather
 * than a bare "1" means signing out and starting over re-opens the invitation
 * exactly once, instead of never again on that device.
 */
const BANNER_DISMISSED_KEY = "schedly-guest-banner-dismissed";

function isBannerDismissed(guestId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BANNER_DISMISSED_KEY) === guestId;
  } catch {
    return false;
  }
}

/**
 * Two jobs, both driven by the one signal that says "this device was a guest
 * at some point" — the guest id in localStorage:
 *
 *  1. Claim: once the user is signed in as a real account, move the guest's
 *     data onto it so a guest who decides to sign up doesn't lose anything.
 *  2. Nudge: while they are still a guest, show a banner explaining that
 *     their schedule lives on this device only, with a link to sign up.
 */
export function GuestStatus({ hidden = false }: { hidden?: boolean }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  // Read via useSyncExternalStore (see guest-client.ts) — hydration-safe and
  // keeps every instance in sync when the marker is cleared.
  const guestId = useGuestId();
  const claimedRef = useRef(false);
  // Gate the localStorage read behind mount: reading it during render would make
  // the first client render disagree with the server HTML, and the banner would
  // flash on every page load before vanishing.
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);

  const userId = (user as { id?: string } | null | undefined)?.id;
  const isGuest = (user as { isAnonymous?: boolean } | null | undefined)?.isAnonymous === true;

  // Claim on sign-in/sign-up. Ref-guarded so React 18/19 double-invoked
  // effects can't fire two migrations at once.
  useEffect(() => {
    if (isLoading || !userId || !guestId) return;
    if (guestId === userId) {
      // Still a guest — nothing to claim yet.
      return;
    }
    if (claimedRef.current) return;
    claimedRef.current = true;

    void (async () => {
      const res = await claimGuestAccount(guestId).catch(() => null);
      if (res?.claimed) {
        // Data just moved underneath the dashboard; refetch to show it.
        clearGuestId();
        notifyGuestIdChanged();
        window.location.reload();
      } else if (res?.reason === "migration-failed") {
        // Keep the marker so the next mount can retry — dropping it here
        // would silently lose the guest's schedule.
        claimedRef.current = false;
      } else {
        // Guest row is gone (or was never ours) — stop retrying on every nav.
        clearGuestId();
        notifyGuestIdChanged();
      }
    })();
  }, [isLoading, userId, guestId]);

  // Only nudge guests, and only on the main pages — not on full-screen
  // immersive screens (design editor, flashcard study) where a fixed bar
  // would cover the canvas. Permanently dismissable: the user already knows
  // they're a guest, and a bar they can't get rid of just covers the timetable.
  //
  // `hidden` retires the banner while the mobile drawer is open — it is anchored
  // just above the bottom nav, so hiding the nav alone would strand it floating
  // mid-screen. It only gates rendering: the claim effect above must keep
  // running, since unmounting would reset its "already tried" ref.
  const showBanner =
    isGuest &&
    !!guestId &&
    mounted &&
    !dismissed &&
    !hidden &&
    !isBannerDismissed(guestId) &&
    pathname !== "/design" &&
    !(pathname.startsWith("/flashcards/") && pathname.endsWith("/study"));

  if (!showBanner) return null;

  const dismissBanner = () => {
    try {
      window.localStorage.setItem(BANNER_DISMISSED_KEY, guestId);
    } catch {
      /* storage disabled — the state below still hides it for this page */
    }
    setDismissed(true);
  };

  return (
    // Sits above the mobile bottom nav (z-40) and the desktop page padding;
    // hidden from the layout's own bottom nav pages via the caller's prop.
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 px-4 md:bottom-6 md:left-auto md:right-6 md:w-96 md:px-0">
      <div className="flex items-center gap-2 rounded-xl border-2 border-foreground/70 bg-card px-3 py-2.5 shadow-[3px_3px_0_0_#401f32]">
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
          You&apos;re using Schedly as a guest. Create an account to sync across devices.
        </p>
        <a
          href="/register"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-foreground/70 bg-primary px-3 py-1.5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" />
          Sign up
        </a>
        <button
          type="button"
          onClick={dismissBanner}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-foreground/70 text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
