"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full">
      <div className="relative z-10 flex min-h-screen">
        {/* Desktop-only brand panel. Colours come from the active theme's CSS
            variables rather than hardcoded neutrals — the auth pages render
            inside ThemeProvider, so `text-foreground` tracks whatever preset
            the visitor picked. */}
        <div className="relative hidden lg:flex lg:w-1/2 lg:flex-col lg:overflow-hidden lg:pl-12 lg:pr-6">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute left-[-14rem] top-[-14rem] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_20%,transparent),transparent)]" />
            <div className="animate-blob absolute bottom-[-7rem] left-[-5rem] h-64 w-64 rounded-full bg-primary/[0.05] blur-[80px]" />
          </div>

          <Link href="/" className="relative mt-8 flex w-full max-w-md items-center gap-3">
            <Image src="/images/logo.jpg" alt="" aria-hidden width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-2xl font-bold tracking-tight text-foreground">Schedly</span>
          </Link>

          <div className="relative my-auto w-full max-w-md space-y-6 py-10">
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-foreground">
              Your classes,
              <br />
              automatically
              <br />
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                organized.
              </span>
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              Snap a photo of your class schedule. Schedly extracts,
              organizes, and reminds you &mdash; so you never miss a class again.
            </p>
            <div className="flex gap-8 pt-2">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-primary">10s</span>
                <span className="text-sm text-muted-foreground">Fast extraction</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-primary">24/7</span>
                <span className="text-sm text-muted-foreground">Reminders</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-primary">100%</span>
                <span className="text-sm text-muted-foreground">Free</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-screen w-full items-center justify-center bg-transparent p-4 lg:w-1/2 lg:justify-start lg:px-6 lg:py-8">
          <div className="w-full max-w-lg">
            <div className="mb-8 flex lg:hidden">
              <Link
                href="/"
                aria-label="Back to home"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background text-foreground shadow-sm transition-colors hover:bg-muted active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
