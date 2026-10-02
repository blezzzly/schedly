"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUnreadNotificationCount } from "@/app/(dashboard)/notifications/actions";

const POLL_INTERVAL = 60_000;

/** Bell icon with a live unread-count badge. Polls the unread count every 30s,
 *  refreshes on window focus, and refreshes again on every navigation (e.g.
 *  returning from the Notifications page right after marking reads).
 *
 *  `variant="floating"` (default) is the fixed top-right button used in the
 *  mobile app shell. `variant="inline"` is the same bell without the fixed
 *  positioning, sized to sit level with the avatar in the desktop dashboard
 *  header. */
export function NotificationBell({
  variant = "floating",
  className,
}: {
  variant?: "floating" | "inline";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (!mounted.current) return;
      getUnreadNotificationCount()
        .then((n) => {
          if (mounted.current) setUnread(n);
        })
        .catch(() => {});
    };

    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  return (
    <button
      onClick={() => router.push("/notifications")}
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
        variant === "floating"
          ? "fixed right-[4.75rem] top-[calc(env(safe-area-inset-top)+1rem)] z-50 border-2 border-foreground/70 bg-sidebar text-sidebar-foreground shadow-[3px_3px_0_0_#401f32] hover:bg-sidebar md:right-4"
          : "border-2 border-foreground/70 bg-card text-muted-foreground shadow-[3px_3px_0_0_#401f32] hover:bg-muted hover:text-foreground",
        className,
      )}
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
