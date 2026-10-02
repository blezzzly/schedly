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
        <div className="hidden lg:flex lg:w-1/2 lg:flex-col lg:items-end lg:justify-between lg:pl-12 lg:pr-6 text-neutral-900">
          <Link href="/" className="flex items-center gap-3 lg:w-full lg:max-w-md lg:mt-8">
            <Image src="/images/logo.jpg" alt="" aria-hidden width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-2xl font-bold tracking-tight">Schedly</span>
          </Link>
          <div className="space-y-6 lg:my-auto lg:w-full lg:max-w-md">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Your classes,
              <br />
              automatically
              <br />
              organized.
            </h1>
            <p className="max-w-md text-lg text-neutral-600 leading-relaxed">
              Snap a photo of your class schedule. Schedly extracts,
              organizes, and reminds you &mdash; so you never miss a class again.
            </p>
            <div className="flex gap-8 pt-2">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">10s</span>
                <span className="text-sm text-neutral-500">Fast extraction</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">24/7</span>
                <span className="text-sm text-neutral-500">Reminders</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">100%</span>
                <span className="text-sm text-neutral-500">Free</span>
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
