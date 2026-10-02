"use client";

import { useEffect } from "react";

// Development-only safety net. The service worker is now registered only in
// production builds, but a SW installed before that change stays active in the
// browser and keeps serving stale `/_next/static` chunks (cache-first) that no
// longer match the current dev build — which surfaces as "module factory is not
// available" / ChunkLoadError loops on every reload.
//
// On every dev page load this unregisters any leftover SW and wipes the caches
// it created. It's a no-op in production, where the real SW must keep running.
export function DevSwCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((reg) => reg.unregister().catch(() => false)),
        );
      } catch {
        // Best-effort — never block the page on cleanup.
      }

      if (cancelled) return;
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      } catch {
        // Best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
