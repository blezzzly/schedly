import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh-fallback flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/70 p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-3xl font-bold text-primary-foreground shadow-lg shadow-primary/30">
          404
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on schedule.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link href="/" className="w-full sm:w-auto">
            <Button className="h-11 w-full bg-gradient-to-r from-primary to-primary/80 font-medium text-primary-foreground shadow-md shadow-primary/30 hover:from-primary hover:to-primary/80 sm:px-6">
              Back to home
            </Button>
          </Link>
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="outline" className="h-11 w-full font-medium sm:px-6">
              Go to dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
