"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { primaryNav } from "@/config/navigation";
import { openQuickAdd, closeQuickAdd, getQuickAddSnapshot } from "@/lib/quick-add-sheet";
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  BellRing,
  Timer,
  Camera,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  calendar: Calendar,
  "check-square": CheckSquare,
  "bell-ring": BellRing,
  timer: Timer,
};

/**
 * `hidden` retires the nav while the mobile drawer is open.
 *
 * Both this and the drawer sat at `z-40`, and the drawer is `top-16 max-h-[80vh]`
 * — so on a tall phone it reached down into the nav, and because this nav comes
 * later in the DOM it painted straight over the drawer's lower half. Two
 * competing navigation targets on one screen, and the tap target belonged to
 * whichever won the paint order.
 */
export function BottomNav({ hidden = false }: { hidden?: boolean }) {
  const pathname = usePathname();
  const items = primaryNav;

  // Opens the capture flow in a sheet. Already open → just dismiss, so the
  // button is a toggle rather than a no-op.
  const handleQuickAdd = () => {
    if (getQuickAddSnapshot()) {
      closeQuickAdd();
    } else {
      openQuickAdd();
    }
  };

  return (
    <nav
      aria-label="Primary"
      // `invisible` (not just opacity-0) so a hidden nav is out of the
      // accessibility tree and can't swallow taps meant for the page behind it.
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden",
        hidden && "pointer-events-none invisible translate-y-[130%] opacity-0",
      )}
      aria-hidden={hidden}
    >
      <div
        className="bottom-nav flex items-end justify-center gap-2 rounded-[1.75rem] border-2 border-foreground/70 bg-card/90 px-3 shadow-[4px_4px_0_0_#401f32] ring-1 ring-black/[0.03] backdrop-blur-xl"
        style={{ paddingBottom: "calc(0.75rem + var(--sab))", marginBottom: "calc(1.25rem + var(--sab))" }}
      >
        {items.slice(0, 2).map((item) => {
          const Icon = iconMap[item.icon] || Calendar;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-7 w-7 translate-y-1.5" strokeWidth={active ? 2 : 1.75} />
            </Link>
          );
        })}

        <button
          type="button"
          onClick={handleQuickAdd}
          aria-label="Quick add"
          title="Quick add"
          className="relative -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-foreground/80 bg-primary text-primary-foreground transition-transform active:scale-95"
        >
          <Camera className="h-6 w-6 -translate-y-0.5" strokeWidth={2.5} />
        </button>

        {items.slice(2).map((item) => {
          const Icon = iconMap[item.icon] || Calendar;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-7 w-7 translate-y-1.5" strokeWidth={active ? 2 : 1.75} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
