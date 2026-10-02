"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Hydration-safe "mounted on the client" flag.
 * Returns `false` during SSR and the first client render (so the server and
 * client output match), then flips to `true` after hydration — without
 * triggering a hydration mismatch.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
