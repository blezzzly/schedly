"use client";

import { ChaoticOrbit } from "ldrs/react";
import { cn } from "@/lib/utils";

export function Spinner({
  size = 16,
  className,
  color,
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  // A CSS variable reference, not a resolved value.
  //
  // This used to call getComputedStyle() and branch on
  // `typeof window !== "undefined"`, returning "currentColor" on the server and
  // the resolved colour on the client. React compares the server HTML against
  // the first client render, so every SSR'd Spinner logged a hydration mismatch
  // on the inline `color` and on ldrs's `--uib-color`.
  //
  // Passing `var(--muted-foreground)` through verbatim avoids that entirely:
  // ldrs writes the string straight into `--uib-color`, and the browser resolves
  // it at paint time. The rendered attribute is then byte-identical on both
  // sides, and it still tracks the active theme rather than freezing whichever
  // value happened to be computed on first render.
  const resolvedColor = color ?? "var(--muted-foreground)";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center align-middle",
        className
      )}
      style={{ width: size, height: size, color: resolvedColor }}
    >
      <ChaoticOrbit
        size={String(size)}
        speed="1.5"
        color={resolvedColor}
      />
    </span>
  );
}
