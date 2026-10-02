"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh-fallback flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/70 p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-3xl font-bold text-primary-foreground shadow-lg shadow-primary/30">
          !
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          An unexpected error occurred. Try again, or head back to your schedule.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button
            onClick={() => unstable_retry()}
            className="h-11 w-full bg-gradient-to-r from-primary to-primary/80 font-medium text-primary-foreground shadow-md shadow-primary/30 hover:from-primary hover:to-primary/80 sm:w-auto sm:px-6"
          >
            Try again
          </Button>
          <Link href="/" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="h-11 w-full font-medium sm:px-6"
            >
              Back to home
            </Button>
          </Link>
        </div>
        {error?.digest && (
          <p className="mt-5 text-xs text-muted-foreground/60">
            Error reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
