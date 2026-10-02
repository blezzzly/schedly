"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    const t = setTimeout(() => setOffline(navigator.onLine === false), 0);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 md:hidden" style={{ bottom: "calc(6.5rem + var(--sab))" }}>
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-foreground/90 px-3.5 py-2 text-xs font-medium text-background shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <WifiOff className="h-3.5 w-3.5" />
        Offline — showing saved data
      </div>
    </div>
  );
}