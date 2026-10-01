"use client";

import { BottomSheet } from "@/components/ui/bottom-sheet";

/**
 * Wraps the shared profile in the app's real bottom sheet.
 *
 * Kept as its own client module so the page itself stays a Server Component.
 * Without this the page would have to hand-roll the sheet markup, and a shared
 * profile is exactly the surface that most needs to match the app — it is the
 * one page a person sees outside their own account.
 *
 * `size="auto"` — the sheet is exactly as tall as its content, so a shared
 * profile is a small card rather than a screen with five lines on it.
 *
 * `dismissible={false}`: a shared profile is a page, not a modal, and there is
 * nothing behind it worth getting back to. Tapping the scrim used to dismiss the
 * sheet and leave a blank background, which just looked broken. Back still
 * works — the browser button.
 *
 * The lighter scrim matters more than it looks: at the default `bg-black/40`
 * plus `backdrop-blur-sm`, the dot grid behind the sheet was smeared into an
 * indistinct grey wash. Lightening it lets the texture actually read, while
 * still separating the card from the backdrop.
 */
export function ProfileSheet({ children }: { children: React.ReactNode }) {
  return (
    <BottomSheet
      open
      dismissible={false}
      size="auto"
      backdropClassName="bg-black/25"
      onClose={() => window.history.back()}
    >
      {children}
    </BottomSheet>
  );
}
