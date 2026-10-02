"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cacheRead } from "@/lib/offline-cache";

/** Redirect signed-in users away from the public landing page.
 *
 * Online, src/proxy.ts already sends "/" to "/dashboard" when a session
 * cookie exists. But when the page is served offline by the service worker
 * the server never runs, so we check the locally cached session instead.
 * The cache is only written after a confirmed session, and cleared on
 * sign-out, so it's a safe signal.
 *
 * We only redirect when "/dashboard" is actually in an SW cache — otherwise
 * the offline navigation would fall back to "/" again and loop forever.
 */
export function SessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const dashboardIsCached = async (): Promise<boolean> => {
      if (typeof caches === "undefined") return false;
      const names = await caches.keys().catch(() => []);
      for (const name of names) {
        const cache = await caches.open(name);
        const hit = await cache.match("/dashboard").catch(() => undefined);
        if (hit) return true;
      }
      return false;
    };

    (async () => {
      const cached = await cacheRead<Record<string, unknown>>("session:user").catch(() => null);
      if (cancelled || !cached) return;
      if (!(await dashboardIsCached())) return;
      if (!cancelled) router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
