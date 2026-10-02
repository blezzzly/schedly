"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Dices,
  Mail,
  UserRound,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { pickGuestName, newGuestSeed } from "@/features/guest/persona";
import { authFetch } from "@/lib/auth-fetch";
import { writeGuestId } from "@/lib/guest-client";

const LAST_SCREEN = 1;

export function MobileOnboarding() {
  const [screen, setScreen] = useState(0);
  const touchX = useRef<number | null>(null);

  // The onboarding is a fixed full-viewport app: nothing should scroll, so
  // lock the page scroll for the whole time it is mounted on mobile.
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const go = (next: number) => {
    setScreen(Math.max(0, Math.min(LAST_SCREEN, next)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchX.current;
    const dx = endX - touchX.current;
    if (dx < -48) go(screen + 1);
    else if (dx > 48) go(screen - 1);
    touchX.current = null;
  };

  return (
    <div
      className="relative h-dvh-fallback overflow-hidden"
      style={{
        backgroundImage: "var(--app-backdrop)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Screens carousel */}
      <div
        className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ transform: `translateX(-${screen * 100}%)` }}
      >
        <WelcomeScreen active={screen === 0} onNext={() => go(1)} onSkip={() => go(1)} />
        <AuthScreen active={screen === 1} />
      </div>
    </div>
  );
}

/* ============ Shared ============ */

function ScreenContent({
  active,
  delay = 0,
  className = "",
  children,
}: {
  active: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${className} ${active ? "animate-fade-up" : "opacity-0"}`}
      style={active ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground/70 bg-primary text-[15px] font-bold text-primary-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:bg-primary/90 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32]"
    >
      {children}
    </button>
  );
}

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="mt-3 flex shrink-0 items-center justify-center gap-1.5 pb-[env(safe-area-inset-bottom)]">
      {[0, 1].map((i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all duration-500 ease-out ${
            i === current ? "w-6 bg-primary" : "w-2 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function BrandRow({ onSkip }: { onSkip?: () => void }) {
  return (
    <div className="flex items-center justify-between pb-[clamp(0.5rem,1.5dvh,1rem)]">
      <div className="flex items-center gap-2.5">
        <Image
          src="/images/logo.jpg"
          alt="Schedly"
          width={36}
          height={36}
          className="h-9 w-9 rounded-xl object-cover"
        />
        <span className="text-[19px] font-bold tracking-tight text-foreground">Schedly</span>
      </div>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="px-1 py-2 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>
      )}
    </div>
  );
}

/* ============ Screen 1 — Welcome ============ */

type Cell = { name: string; color: string } | null;

const GRID_A: Cell[][] = [
  [null, { name: "Phys", color: "#0ea5e9" }, null, { name: "Hist", color: "#ef4444" }, { name: "Eng", color: "#8b5cf6" }, null],
  [{ name: "Math", color: "#3b82f6" }, null, { name: "Bio", color: "#f59e0b" }, null, { name: "CS", color: "#22c55e" }, { name: "Phys", color: "#0ea5e9" }],
  [null, { name: "Eng", color: "#8b5cf6" }, { name: "Math", color: "#3b82f6" }, { name: "CS", color: "#22c55e" }, null, { name: "Hist", color: "#ef4444" }],
];

const GRID_B: Cell[][] = [
  [{ name: "Bio", color: "#f59e0b" }, null, { name: "CS", color: "#22c55e" }, { name: "Phys", color: "#0ea5e9" }, null, { name: "Math", color: "#3b82f6" }],
  [null, { name: "Hist", color: "#ef4444" }, { name: "Eng", color: "#8b5cf6" }, null, { name: "Math", color: "#3b82f6" }, { name: "Bio", color: "#f59e0b" }],
  [{ name: "Eng", color: "#8b5cf6" }, { name: "Phys", color: "#0ea5e9" }, null, { name: "Hist", color: "#ef4444" }, { name: "Bio", color: "#f59e0b" }, null],
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Snappy with a touch of overshoot so the card feels like it's popped forward. */
const HOVER_SPRING = { type: "spring", stiffness: 320, damping: 22, mass: 0.6 } as const;
const REST_SHADOW = "3px 3px 0 0 #401f32";
const HOVER_SHADOW = "7px 7px 0 0 #401f32";

function MiniTimetable({
  grid,
  label,
  side,
  hovered = false,
  dimmed = false,
}: {
  grid: Cell[][];
  label: string;
  side: "back" | "front";
  hovered?: boolean;
  dimmed?: boolean;
}) {
  // The card that lost the hover drifts back along its own diagonal. The hovered
  // card only scales — a moving edge under the cursor flickers the hover off.
  const recede = side === "back" ? { x: -6, y: -10 } : { x: 6, y: 10 };

  return (
    <motion.div
      className="mx-auto w-full max-w-2xl rounded-xl border-2 border-foreground/70 bg-card p-1.5 shadow-[3px_3px_0_0_#401f32] will-change-transform sm:p-2"
      initial={false}
      animate={{
        scale: hovered ? 1.06 : dimmed ? 0.96 : 1,
        x: dimmed ? recede.x : 0,
        y: dimmed ? recede.y : 0,
        opacity: dimmed ? 0.45 : 1,
        boxShadow: hovered ? HOVER_SHADOW : REST_SHADOW,
      }}
      transition={{
        scale: HOVER_SPRING,
        x: HOVER_SPRING,
        y: HOVER_SPRING,
        boxShadow: HOVER_SPRING,
        // Kept as a plain tween — a spring would overshoot past 0/1.
        opacity: { duration: 0.18, ease: "easeOut" },
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-destructive/60" />
        <div className="h-2 w-2 rounded-full bg-yellow-400/60" />
        <div className="h-2 w-2 rounded-full bg-green-400/60" />
        <span className="ml-1 text-[9px] font-mono text-muted-foreground">{label}</span>
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${DAY_LABELS.length}, minmax(0, 1fr))` }}>
        {DAY_LABELS.map((d) => (
          <div key={d} className="rounded bg-primary/10 p-0.5 text-center text-[9px] font-semibold text-primary">
            {d}
          </div>
        ))}
        {grid.map((row, ri) =>
          row.map((cell, ci) => (
            <div key={`${ri}-${ci}`} className="min-h-[30px]">
              {cell ? (
                <div className="flex h-full min-h-[30px] items-center justify-center rounded bg-muted/5 p-0.5 text-center" style={{ backgroundColor: cell.color + "1f", color: cell.color }}>
                  <span className="text-[9px] font-semibold leading-tight">{cell.name}</span>
                </div>
              ) : (
                <div className="flex h-full min-h-[30px] items-center justify-center rounded bg-muted/30" />
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function TimetableVisual({ active }: { active: boolean }) {
  const [hovered, setHovered] = useState<"back" | "front" | null>(null);

  // Ignore touch/pen so a tap on a phone doesn't leave a card stuck "hovered".
  const handlePointerEnter = (side: "back" | "front") => (e: React.PointerEvent) => {
    setHovered(e.pointerType === "mouse" ? side : null);
  };

  return (
    <div
      className={`relative mx-auto h-[clamp(10rem,32dvh,14rem)] w-[clamp(22rem,96vw,30rem)] transition-all duration-500 ease-out ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Both cards are absolutely positioned siblings, so whichever one is
          hovered is given the higher z-index to jump the stack. */}
      <div
        className={`absolute left-2 top-2 w-[80%] -rotate-6 transition-all duration-500 ease-out ${
          active ? "translate-x-0 translate-y-0" : "-translate-x-2"
        } ${
          !active
            ? "opacity-40"
            : hovered === "back"
              ? "z-20 opacity-100"
              : "z-10 opacity-90"
        }`}
        onPointerEnter={handlePointerEnter("back")}
        onPointerLeave={() => setHovered(null)}
      >
        <MiniTimetable
          grid={GRID_B}
          label="Next Week"
          side="back"
          hovered={hovered === "back"}
          dimmed={hovered === "front"}
        />
      </div>

      <div
        className={`absolute right-2 top-6 w-[80%] rotate-[4deg] transition-all duration-500 ease-out ${
          active ? "translate-x-0 translate-y-0" : "translate-x-2"
        } ${
          !active
            ? "opacity-0"
            : hovered === "front"
              ? "z-20 opacity-100"
              : "z-10 opacity-100"
        }`}
        onPointerEnter={handlePointerEnter("front")}
        onPointerLeave={() => setHovered(null)}
      >
        <MiniTimetable
          grid={GRID_A}
          label="This Week"
          side="front"
          hovered={hovered === "front"}
          dimmed={hovered === "back"}
        />
      </div>
    </div>
  );
}

function WelcomeScreen({
  active,
  onNext,
  onSkip,
}: {
  active: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col px-8 pb-[clamp(1.5rem,4dvh,2rem)] pt-[clamp(1rem,2dvh,1.5rem)]">
      <BrandRow onSkip={onSkip} />

      <div className="flex flex-1 flex-col items-center justify-center">
        <ScreenContent active={active} className="mb-[clamp(1.75rem,5dvh,2.75rem)]">
          <TimetableVisual active={active} />
        </ScreenContent>

        <ScreenContent active={active} delay={120} className="flex flex-col items-center text-center">
          <h1 className="text-[clamp(2rem,9.5vw,2.625rem)] font-semibold leading-[1.08] tracking-tight text-foreground">
            Stay
            <br />
            organized.
          </h1>
          <p className="mt-4 max-w-[280px] text-[clamp(0.9375rem,4vw,1rem)] leading-relaxed text-muted-foreground">
            Snap your timetable. We&apos;ll handle the rest.
          </p>
        </ScreenContent>
      </div>

      <ScreenContent active={active} delay={220}>
        <PrimaryButton onClick={onNext}>
          Get Started
          <ChevronRight className="h-5 w-5" />
        </PrimaryButton>
      </ScreenContent>
      <ProgressDots current={0} />
    </div>
  );
}

/* ============ Screen 2 — Get started ============ */

function AuthScreen({ active }: { active: boolean }) {
  const [guestPending, setGuestPending] = useState(false);
  const [guestError, setGuestError] = useState("");
  // Seed drives the name so the dice can re-roll instantly, with no network
  // round-trip while the user is just playing with it.
  const [guestSeed, setGuestSeed] = useState(() => newGuestSeed());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rolling, setRolling] = useState(false);

  const guestName = pickGuestName(guestSeed);

  const openPicker = () => {
    setGuestError("");
    setGuestSeed(newGuestSeed());
    setPickerOpen(true);
  };

  const reroll = () => {
    setRolling(true);
    setGuestSeed(newGuestSeed());
    // Brief spin so the dice feels like a roll rather than a page swap.
    setTimeout(() => setRolling(false), 320);
  };

  const handleGuest = async () => {
    if (guestPending) return;
    setGuestPending(true);
    setGuestError("");
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
        setGuestError(data?.error ?? "We couldn't start a guest session. Please try again.");
        setGuestPending(false);
        setPickerOpen(true);
        return;
      }
      const data = (await res.json()) as { userId?: string };
      if (data.userId) writeGuestId(data.userId);
      // Guests land straight in the app — there's no username/avatar setup
      // step for them, and their onboardingCompleted flag is already true.
      window.location.href = "/dashboard";
    } catch {
      setGuestError("Network problem. Please check your connection.");
      setGuestPending(false);
    }
  };

  return (
    <div className="flex w-full shrink-0 flex-col px-8 pb-[clamp(1.5rem,4dvh,2rem)] pt-[clamp(1rem,2dvh,1.5rem)]">
      <BrandRow />

      <div className="flex flex-1 flex-col items-center justify-center">
        <ScreenContent active={active} delay={120} className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground/70 bg-primary/20 text-primary shadow-[3px_3px_0_0_#401f32]">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <h2 className="text-[clamp(1.875rem,8.5vw,2.25rem)] font-semibold leading-[1.1] tracking-tight text-foreground">
            You&apos;re all set.
          </h2>
          <p className="mt-3 max-w-[280px] text-[clamp(0.9375rem,4vw,1rem)] leading-relaxed text-muted-foreground">
            Sign in to sync your schedule across all your devices — or jump straight
            in and try it first.
          </p>
        </ScreenContent>
      </div>

      <ScreenContent
        active={active}
        delay={220}
        className="flex flex-col gap-[clamp(0.75rem,2.5dvh,1rem)]"
      >
        <a
          href="/login"
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-foreground/70 bg-primary text-[15px] font-bold text-primary-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:bg-primary/90 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32]"
        >
          <Mail className="h-5 w-5" />
          Continue with Email
        </a>

        {/* Guest path — a real session, just no account to sign back into.
            Opens the name picker first so the guest gets an identity they can
            see (and re-roll) before anything is created. */}
        <button
          type="button"
          onClick={openPicker}
          disabled={guestPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground/70 bg-card text-[14px] font-semibold text-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:bg-muted/60 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32] disabled:opacity-60"
        >
          <UserRound className="h-[18px] w-[18px]" />
          Continue without an account
        </button>

        {guestError && (
          <p role="alert" className="text-center text-[12px] font-medium text-destructive">
            {guestError}
          </p>
        )}

        <div className="mt-1 flex flex-col items-center gap-1.5">
          <p className="text-[clamp(0.8125rem,3.9vw,0.875rem)] text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Log In
            </Link>
          </p>
          <p className="text-[clamp(0.8125rem,3.9vw,0.875rem)] text-muted-foreground">
            New here?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create Account
            </Link>
          </p>
        </div>
      </ScreenContent>

      {/* Name picker — rolled locally so the dice is instant. The short
          `guestNNN` handle is assigned server-side on confirm, so what you
          see here is purely cosmetic and always accepted. */}
      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} size="auto">
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

          {guestError && (
            <p role="alert" className="text-[12px] font-medium text-destructive">
              {guestError}
            </p>
          )}

          <div className="flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={handleGuest}
              disabled={guestPending}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground/70 bg-primary text-[15px] font-bold text-primary-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:bg-primary/90 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32] disabled:opacity-60"
            >
              {guestPending ? <Spinner size={18} color="var(--primary-foreground)" /> : null}
              {guestPending ? "Setting up…" : `Continue as ${guestName}`}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="h-10 w-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      <ProgressDots current={2} />
    </div>
  );
}