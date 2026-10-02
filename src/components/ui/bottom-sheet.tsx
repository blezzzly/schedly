"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /**
   * "sheet"  — anchored to the bottom edge (the default everywhere).
   * "dialog" — anchored to the bottom edge on small screens, but becomes a
   *             centred, capped dialog from `md` up. Needed for actions that
   *             are reachable from desktop CTAs, where a full-width bottom
   *             sheet across a wide monitor reads as a layout bug.
   */
  variant?: "sheet" | "dialog";
  /**
   * Preset height for the anchored form. Resolved through CSS classes rather
   * than an inline style because the `vh` -> `dvh` fallback needs two
   * declarations and an inline style only holds one.
   *   "default" — the tall sheet (profile).
   *   "sm"      — a shorter fixed height (capture).
   *   "auto"    — no fixed height at all, just a viewport cap, so the panel is
   *               exactly as tall as its content (short pickers/dialogs).
   * The `dialog` variant replaces fixed heights with a max-height once centred.
   */
  size?: "default" | "sm" | "auto";
  /** Inline height override. Wins over `size`; prefer `size`. */
  height?: string;
  /**
   * Whether the sheet can be dismissed by tapping the scrim, pressing Escape or
   * dragging it down. Default `true`.
   *
   * Set false when the sheet IS the page — a shared profile link, say. Tapping
   * the scrim there used to leave an empty background with nothing behind it,
   * which reads as a bug rather than as a dismissal.
   */
  dismissible?: boolean;
  /**
   * Replaces the default `bg-black/40` scrim. For sheets that sit over content
   * worth seeing — a shared profile over a textured backdrop, say — the default
   * scrim plus its blur erases whatever is behind it.
   */
  backdropClassName?: string;
}

/** Slightly softer than the old 400/35 — this reads as a glide, not a flick. */
const SHEET_SPRING = { type: "spring", stiffness: 320, damping: 32, mass: 0.85 } as const;
const DIALOG_SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.7 } as const;
const BACKDROP_EASE = [0.32, 0.72, 0, 1] as const;

/** Matches the `md:` breakpoint the layout and every panel here use. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeToDesktop(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/**
 * True once the viewport is at least `md`.
 *
 * `useSyncExternalStore` rather than `useState` + effect, matching `useMounted`
 * in this codebase: no cascading render, and no hydration mismatch, since the
 * server snapshot is `false`.
 *
 * Needed because from md up every sheet is a centred dialog, so it must enter
 * with the dialog's scale-and-fade. Keying that off the `variant` prop instead
 * left a small centred card sliding up from the bottom edge of a 1440px screen.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DESKTOP_QUERY).matches : false),
    () => false,
  );
}

export function BottomSheet({
  open,
  onClose,
  children,
  className,
  variant = "sheet",
  size = "default",
  height,
  dismissible = true,
  backdropClassName,
}: BottomSheetProps) {
  const reduceMotion = useReducedMotion();
  const isDialog = variant === "dialog";
  // Animation follows the viewport, not the variant: from md up every sheet is
  // a centred dialog regardless of how it was declared, so it must enter the
  // way a dialog enters.
  const isDesktop = useIsDesktop();
  const centred = isDialog || isDesktop;
  // Drag is started from the handle, not the whole panel: the body of every
  // sheet scrolls, and a container-level drag would capture the pointer and
  // fight that scroll.
  const dragControls = useDragControls();

  // Lock the page behind the sheet while it's open. Save and restore the
  // previous value rather than clearing to "" — other surfaces (the mobile
  // onboarding flow) also lock scroll, and blindly resetting would unlock the
  // page underneath them.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes, matching the backdrop-tap and drag affordances.
  useEffect(() => {
    if (!open) return;
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissible]);

  // Portal to <body>, or the sheet silently breaks in any tree that has a
  // transformed ancestor. A transformed element becomes the containing block
  // for `position: fixed` descendants, so the sheet would be positioned against
  // that ancestor instead of the viewport — on the onboarding carousel (which
  // is translateX'd and inside overflow-hidden) it ended up off-screen and
  // unclickable while still present in the DOM.
  //
  // `useMounted` keeps the portal off the server (document doesn't exist) and
  // defers it past hydration, so server and client markup match.
  const mounted = useMounted();

  // AnimatePresence is what makes closing smooth: without it the whole tree
  // unmounts the instant `open` flips, so the sheet vanishes instead of
  // sliding back out.
  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: BACKDROP_EASE }}
            className={cn(
              "fixed inset-0 z-40 backdrop-blur-sm",
              // Default scrim is deliberately dark enough to separate the panel
              // from the page. Over a light backdrop, `--app-scrim` is used
              // instead: the same separation without turning the texture behind
              // into mud.
              backdropClassName ?? "bg-black/40"
            )}
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />

          {/* Centering wrapper. `pointer-events-none` so taps that miss the
              panel still reach the backdrop behind it.

              From md up the panel is always centred, not just for
              `variant="dialog"`. A sheet pinned to the bottom of a 1440px
              screen has nothing to anchor to, and the profile sheet — which
              doesn't pass a variant — was rendering as a 90dvh panel stuck in
              the bottom-left corner. Mobile keeps `items-end`, unchanged. */}
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              className={cn(
                // Mobile shadow points up, which is what a sheet rising off the
                // bottom edge needs. From md up it is replaced by the app's hard
                // offset shadow — the old soft `0_18px_50px` blur made every
                // desktop sheet look like it came from a different product.
                "pointer-events-auto relative flex w-full flex-col overflow-hidden border-t-2 border-foreground/70 bg-card shadow-[0_-4px_30px_-5px_rgba(0,0,0,0.15)] md:border-2 md:shadow-[4px_4px_0_0_#401f32]",
                "rounded-t-[2rem] md:max-h-[calc(100dvh-3rem)] md:max-w-lg md:rounded-2xl",
                !height && (size === "sm" ? "h-sheet-sm" : size === "auto" ? "h-sheet-auto" : "h-sheet"),
                // Centred, it is height-capped rather than fixed — a 90dvh card
                // floating in the middle of a desktop screen reads wrong, and
                // short content shouldn't be forced open.
                "md:h-auto",
                className
              )}
              style={height ? { height } : undefined}
              initial={reduceMotion ? { opacity: 0 } : centred ? { y: 24, opacity: 0, scale: 0.97 } : { y: "100%" }}
              animate={reduceMotion ? { opacity: 1 } : centred ? { y: 0, opacity: 1, scale: 1 } : { y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : centred ? { y: 16, opacity: 0, scale: 0.97 } : { y: "100%" }}
              transition={reduceMotion ? { duration: 0 } : centred ? DIALOG_SPRING : SHEET_SPRING}
              // Drag-to-dismiss only makes sense for the bottom-anchored form;
              // a centred dialog has nowhere to go.
              drag={reduceMotion || isDialog || !dismissible ? false : "y"}
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info: PanInfo) => {
                if (!dismissible) return;
                // Fling it away if dragged down far enough, or flicked fast
                // enough that distance alone wouldn't have crossed the threshold.
                if (info.offset.y > 110 || info.velocity.y > 650) onClose();
              }}
            >
              {/* Drag handle. Also the drag affordance — `dragListener={false}`
                  means the drag only begins from here, so the scrolling body
                  below keeps normal touch scrolling.

                  `md:hidden` unconditionally: every sheet is a centred dialog
                  from md up, and there is nothing to pull down. Also hidden on
                  mobile when the sheet can't be dismissed, since a grab handle
                  that does nothing is worse than no handle at all. */}
              <div
                className={cn(
                  "flex shrink-0 cursor-grab touch-none justify-center py-3 select-none active:cursor-grabbing md:hidden",
                  !dismissible && "hidden"
                )}
                onPointerDown={(e) => {
                  if (dismissible) dragControls.start(e);
                }}
              >
                <div className="h-1 w-12 rounded-full bg-foreground/20" />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] md:pb-0">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  // No portal during SSR: document doesn't exist, and the sheet is closed on
  // the server anyway.
  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
