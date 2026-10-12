"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuestNameSheet } from "@/features/guest/guest-name-sheet";
import { cn } from "@/lib/utils";

/**
 * "Continue without an account" — the desktop counterpart to the guest path on
 * the mobile onboarding, so both entry points offer the same deal.
 *
 * Opens the shared name picker rather than creating a session straight away:
 * the guest gets to see (and re-roll) the identity they're signing up under
 * before anything is created, exactly as on mobile.
 *
 * Deliberately NOT `variant="outline"`: that variant's hover is
 * `hover:bg-foreground hover:text-background`, which fills the button solid
 * black on hover and swallows the icon. This is the quietest option in a row of
 * CTAs, so it takes the card treatment the mobile sheet uses instead.
 */
export function GuestCta({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="lg"
        onClick={() => setOpen(true)}
        className={cn(
          "border-2 border-foreground/70 bg-card px-6 text-base font-semibold text-foreground",
          "shadow-[3px_3px_0_0_#401f32] transition-all duration-200",
          "hover:bg-muted/70 hover:shadow-none",
          className,
        )}
      >
        <UserRound />
        Continue without an account
      </Button>

      {/* A bottom sheet spanning a desktop monitor reads as a layout bug, so
          from md up this centres as a dialog instead. */}
      <GuestNameSheet open={open} onClose={() => setOpen(false)} variant="dialog" />
    </>
  );
}