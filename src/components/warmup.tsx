"use client";

import { useEffect } from "react";
import { warmup } from "@/lib/warmup";

export function Warmup() {
  useEffect(() => {
    warmup();
    // The native app has no browser chrome, so keep overscroll contained there
    // to avoid rubber-banding/edge-glow. In the browser, overscroll is left
    // enabled so the browser's own refresh icon appears when pulling down.
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
    if (!isStandalone) {
      const root = document.documentElement;
      root.style.setProperty("--sat", "0px");
      root.style.setProperty("--sar", "0px");
      root.style.setProperty("--sab", "0px");
      root.style.setProperty("--sal", "0px");
    }
  }, []);
  return null;
}
