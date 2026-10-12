"use client";

import { useState } from "react";
import { Dices } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Spinner } from "@/components/ui/spinner";
import { pickGuestName, newGuestSeed } from "@/features/guest/persona";
import { authFetch } from "@/lib/auth-fetch";
import { writeGuestId } from "@/lib/guest-client";

/**
 * "Continue without an account" name picker — roll a persona, then claim it.
 *
 * Shared by the mobile onboarding sheet and the desktop landing CTA so both
 * offer the same deal and there is one implementation of the guest flow.
 *
 * `variant="dialog"` is for desktop callers: a full-width bottom sheet across a
 * wide monitor reads as a layout bug, so from `md` up every sheet centres
 * instead (see BottomSheet).
 */
export function GuestNameSheet({
  open,
  onClose,
  variant = "sheet",
}: {
  open: boolean;
  onClose: () => void;
  variant?: "sheet" | "dialog";
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Seed drives the name so the dice can re-roll instantly, with no network
  // round-trip while the user is just playing with it.
  const [seed, setSeed] = useState(() => newGuestSeed());
  const [rolling, setRolling] = useState(false);

  const guestName = pickGuestName(seed);

  // Fresh roll every time the sheet opens, and clear any error left over from a
  // previous attempt so a reopen never greets someone with a stale failure.
  //
  // Done during render rather than in an effect: `open` is a prop, so this is
  // the documented "adjust state when a prop changes" pattern. An effect here
  // would paint one frame of the last session's name and error first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError("");
      setPending(false);
      setSeed(newGuestSeed());
    }
  }

  const reroll = () => {
    setRolling(true);
    setSeed(newGuestSeed());
    // Brief spin so the dice feels like a roll rather than a page swap.
    setTimeout(() => setRolling(false), 320);
  };

  const handleGuest = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const res = await authFetch("/api/auth/guest", {
        method: "POST",
        headers: {
          "x-csrf-protection": "1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: guestName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        // The sheet stays open on failure so the retry button is right there.
        setError(data?.error ?? "We couldn't start your guest session. Please try again.");
        setPending(false);
        return;
      }
      const data = (await res.json()) as { userId?: string };
      if (data.userId) writeGuestId(data.userId);
      // Guests land straight in the app — there's no username/avatar setup
      // step for them, and their onboardingCompleted flag is already true.
      // A full navigation is deliberate: the dashboard reads the session cookie.
      window.location.href = "/dashboard";
    } catch {
      setError("Network problem. Please check your connection.");
      setPending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} variant={variant} size="auto">
      <div className="flex flex-col items-center gap-5 px-6 pt-2 pb-4 text-center">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Pick a guest name
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            No account, no password. You can create one later and keep
            everything you make.
          </p>
        </div>

        <button
          type="button"
          onClick={reroll}
          aria-label="Roll a different name"
          className="group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-foreground/70 bg-card py-7 shadow-[4px_4px_0_0_#401f32] transition-all duration-200 hover:bg-muted/50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32]"
        >
          <span
            key={guestName}
            className={`text-[clamp(1.75rem,9vw,2.25rem)] font-bold tracking-tight text-primary ${
              rolling ? "animate-pulse" : ""
            }`}
          >
            {guestName}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <Dices className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
            Tap to re-roll
          </span>
        </button>

        {error && (
          <p role="alert" className="text-[12px] font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex w-full flex-col gap-2.5">
          <button
            type="button"
            onClick={handleGuest}
            disabled={pending}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground/70 bg-primary text-[15px] font-bold text-primary-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:bg-primary/90 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32] disabled:opacity-60"
          >
            {pending ? <Spinner size={18} color="var(--primary-foreground)" /> : null}
            {pending ? "Setting up…" : `Continue as ${guestName}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}