import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DesktopLanding() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 border-b-2 border-foreground/70 bg-background/95">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/images/logo.jpg" alt="" aria-hidden width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-lg font-bold tracking-tight text-foreground">Schedly</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started free</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* Hero */}
        <section className="relative overflow-hidden py-28 md:py-40">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute left-1/2 top-[-16rem] h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_22%,transparent),transparent)]" />
            <div className="animate-blob absolute left-[10%] top-[40%] h-64 w-64 rounded-full bg-primary/[0.05] blur-[80px]" />
            <div className="animate-blob absolute right-[8%] top-[55%] h-56 w-56 rounded-full bg-primary/[0.04] blur-[70px] [animation-delay:-7s]" />
          </div>
          <div className="relative container mx-auto max-w-4xl px-4 text-center">
            <p className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              Free forever. No credit card required.
            </p>
            <h1 className="text-5xl font-bold tracking-tight text-foreground leading-[1.06] sm:text-6xl md:text-7xl">
              Your class schedule,{" "}
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                made simple.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground leading-relaxed">
              Upload a photo of your schedule. Schedly turns it into an interactive
              timetable &mdash; with your classes, times, rooms, and reminders.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/register">
                  <Button size="lg" className="px-10 text-base font-bold">
                    Get started free
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button size="lg" variant="outline" className="px-10 text-base font-bold">
                    See how it works
                  </Button>
                </Link>
              </div>
            </div>

            {/* Mock timetable */}
            <div className="mx-auto mt-14 max-w-3xl rounded-xl border-2 border-foreground/70 bg-card/90 p-6 shadow-[3px_3px_0_0_#401f32]">
              <div className="mb-5 flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                <span className="ml-2 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">schedule.pdf</span>
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="rounded-xl border-2 border-foreground/70 bg-primary/10 p-3 text-center font-bold text-primary">Mon</div>
                <div className="rounded-xl border-2 border-foreground/70 bg-primary/10 p-3 text-center font-bold text-primary">Tue</div>
                <div className="rounded-xl border-2 border-foreground/70 bg-primary/10 p-3 text-center font-bold text-primary">Wed</div>
                <div className="rounded-xl border-2 border-foreground/70 bg-primary/10 p-3 text-center font-bold text-primary">Thu</div>
                <div className="rounded-xl border-2 border-foreground/70 bg-primary/10 p-3 text-center font-bold text-primary">Fri</div>

                {[
                  { label: "Math 101", time: "9:00", bg: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
                  { label: "", bg: "bg-muted/20" },
                  { label: "Math 101", time: "9:00", bg: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
                  { label: "", bg: "bg-muted/20" },
                  { label: "Math 101", time: "9:00", bg: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
                ].map((item, i) => (
                  <div key={`r0-${i}`} className={`rounded-xl border-2 border-foreground/10 p-3 text-center min-h-[52px] flex flex-col items-center justify-center ${item.bg}`}>
                    {item.label && <span className="font-semibold leading-tight text-xs">{item.label}</span>}
                    {item.time && <span className="text-[10px] opacity-70">{item.time}</span>}
                  </div>
                ))}
                {[
                  { label: "", bg: "bg-muted/20" },
                  { label: "CS 201", time: "11:00", bg: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
                  { label: "", bg: "bg-muted/20" },
                  { label: "CS 201", time: "11:00", bg: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
                  { label: "", bg: "bg-muted/20" },
                ].map((item, i) => (
                  <div key={`r1-${i}`} className={`rounded-xl border-2 border-foreground/10 p-3 text-center min-h-[52px] flex flex-col items-center justify-center ${item.bg}`}>
                    {item.label && <span className="font-semibold leading-tight text-xs">{item.label}</span>}
                    {item.time && <span className="text-[10px] opacity-70">{item.time}</span>}
                  </div>
                ))}
                {[
                  { label: "", bg: "bg-muted/20" },
                  { label: "Phys 301", time: "14:00", bg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
                  { label: "Phys 301", time: "14:00", bg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
                  { label: "", bg: "bg-muted/20" },
                  { label: "Phys 301", time: "14:00", bg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
                ].map((item, i) => (
                  <div key={`r2-${i}`} className={`rounded-xl border-2 border-foreground/10 p-3 text-center min-h-[52px] flex flex-col items-center justify-center ${item.bg}`}>
                    {item.label && <span className="font-semibold leading-tight text-xs">{item.label}</span>}
                    {item.time && <span className="text-[10px] opacity-70">{item.time}</span>}
                  </div>
                ))}
                {[
                  { label: "", bg: "bg-muted/20" },
                  { label: "", bg: "bg-muted/20" },
                  { label: "Eng 102", time: "16:00", bg: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
                  { label: "Eng 102", time: "16:00", bg: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
                  { label: "", bg: "bg-muted/20" },
                ].map((item, i) => (
                  <div key={`r3-${i}`} className={`rounded-xl border-2 border-foreground/10 p-3 text-center min-h-[52px] flex flex-col items-center justify-center ${item.bg}`}>
                    {item.label && <span className="font-semibold leading-tight text-xs">{item.label}</span>}
                    {item.time && <span className="text-[10px] opacity-70">{item.time}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Problem → Promise */}
        <section className="border-t border-border/40 bg-secondary/10">
          <div className="container mx-auto max-w-4xl px-4 py-20 md:py-28">
            <div className="text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Problem &rarr; Promise
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                Outbound is broken when tools don&apos;t work together
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
                Your team shouldn&apos;t stitch together lead lists, enrichment, copy, video, sequences, and tracking.
                Schedly replaces the messy stack with one simple workflow.
              </p>
            </div>

            {/* Stats */}
            <div className="mt-14 grid grid-cols-2 overflow-hidden rounded-xl border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32] md:grid-cols-4">
              {[
                { value: "10s", label: "Average extraction time" },
                { value: "100%", label: "Free forever, no card" },
                { value: "24/7", label: "Smart class reminders" },
                { value: "0", label: "Tools to juggle" },
              ].map((stat) => (
                <div key={stat.label} className="border-r-2 border-foreground/10 p-6 text-center last:border-r-0">
                  <div className="text-3xl font-bold text-primary sm:text-4xl">{stat.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/40">
          <div className="container mx-auto max-w-5xl px-4 py-20 md:py-28">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">
                Features
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                Built for student life
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Everything you need to stay on top of your classes.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ),
                  title: "Schedule Scanner",
                  description: "Upload a photo of your class schedule and get an interactive timetable.",
                },
                {
                  icon: (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  ),
                  title: "Class Reminders",
                  description: "Get reminded when your next class is coming up so you know what&apos;s next.",
                },
                {
                  icon: (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  ),
                  title: "Weekly Schedule",
                  description: "See your classes from Monday to Saturday in one clean, organized view.",
                },
                {
                  icon: (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  ),
                  title: "Easy to Edit",
                  description: "Review your extracted schedule and make changes whenever something needs updating.",
                },
                {
                  icon: (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ),
                  title: "Works Anywhere",
                  description: "Check your schedule from your phone, laptop, or installed PWA.",
                },
                {
                  icon: (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ),
                  title: "Your Schedule, Your Data",
                  description: "Keep your schedule private and securely connected to your account.",
                },
              ].map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-border/40 bg-secondary/10">
          <div className="container mx-auto max-w-4xl px-4 py-20 md:py-28">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">
                How it works
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                From photo to timetable
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Three steps. Five seconds. Your whole week sorted.
              </p>
            </div>
            <div className="relative grid gap-8 md:grid-cols-3">
              <div className="absolute left-[calc(50%-1px)] top-14 hidden h-[calc(100%-7rem)] w-0.5 border-l-2 border-dashed border-border/60 md:block" style={{ left: "calc(33.33% - 1px)" }} />
              <div className="absolute left-[calc(50%-1px)] top-14 hidden h-[calc(100%-7rem)] w-0.5 border-l-2 border-dashed border-border/60 md:block" style={{ left: "calc(66.66% - 1px)" }} />
              {[
                { n: 1, title: "Upload", desc: "Take a photo or upload your class schedule." },
                { n: 2, title: "Schedly Scans", desc: "Reads your subjects, times, rooms, and details." },
                { n: 3, title: "Check & Save", desc: "Review results, make changes, and save your timetable." },
              ].map((step) => (
                <StepCard key={step.n} {...step} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/40">
          <div className="container mx-auto max-w-2xl px-4 py-24 text-center md:py-36">
            <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Stop checking your schedule manually.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Let Schedly organize your classes so you always know what&apos;s next.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link href="/register">
                <Button size="lg" className="px-12 text-base font-bold">
                  Get started free &rarr;
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground">No credit card. No catch. Just your schedule, sorted.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-10">
        <div className="container mx-auto flex flex-col items-center justify-between gap-5 px-4 md:flex-row md:px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/images/logo.jpg" alt="" aria-hidden width={24} height={24} className="h-6 w-6 rounded-md object-cover" />
            <span className="text-sm font-semibold text-foreground">Schedly</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Schedly. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="group rounded-xl border-2 border-foreground/70 bg-card p-7 shadow-[3px_3px_0_0_#401f32] transition-all duration-200 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_#401f32]">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border-2 border-foreground/70 bg-primary/10 text-primary shadow-[2px_2px_0_0_#401f32] transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        {icon}
      </div>
      <h3 className="mb-2 text-base font-bold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-xl border-2 border-foreground/70 bg-card text-lg font-bold text-foreground shadow-[3px_3px_0_0_#401f32]">
        {n}
      </div>
      <h3 className="mb-2 text-base font-bold text-foreground">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}
