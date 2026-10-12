"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Mail,
  UserRound,
} from "lucide-react";
import { TimetableVisual } from "@/components/landing/timetable-visual";
import { GuestNameSheet } from "@/features/guest/guest-name-sheet";

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
  const [pickerOpen, setPickerOpen] = useState(false);

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
            Opens the shared name picker first so the guest gets an identity
            they can see (and re-roll) before anything is created. */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-foreground/70 bg-card text-[14px] font-semibold text-foreground shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:bg-muted/60 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32]"
        >
          <UserRound className="h-[18px] w-[18px]" />
          Continue without an account
        </button>

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

      {/* Name picker — shared with the desktop landing CTA. Rolled locally so the
          dice is instant; the short `guestNNN` handle is assigned server-side
          on confirm, so what's shown is purely cosmetic and always accepted. */}
      <GuestNameSheet open={pickerOpen} onClose={() => setPickerOpen(false)} />

      <ProgressDots current={2} />
    </div>
  );
}