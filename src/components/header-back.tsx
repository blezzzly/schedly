"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Inline back button shown at the start of page headers (settings, profile,
// notifications, feedback, admin). Replaces the old floating top-left back
// arrow so it sits flush with the page title instead.
export function HeaderBack({ to }: { to: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(to)}
      aria-label="Back"
      className="hidden shrink-0 rounded-full border border-border/60 bg-card/50 p-2 text-foreground transition-colors hover:bg-muted/60 md:block"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}