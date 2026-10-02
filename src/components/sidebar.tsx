"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navGroups, type NavItem } from "@/config/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ThemePicker } from "@/components/theme-picker";
import { APP_VERSION } from "@/lib/version";
import {
  Calendar,
  ArrowUp,
  CheckSquare,
  Bell,
  BellRing,
  GraduationCap,
  Inbox,
  ChevronRight,
  LifeBuoy,
  Timer,
  LayoutDashboard,
  UploadCloud,
  StickyNote,
  Layers,
  Info,
  User,
  Settings,
  LogOut,
  BookOpen,
  Brain,
  CalendarCheck,
  Zap,
  Flame,
  TreePine,
  Shield,
  Gauge,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  upload: ArrowUp,
  "check-square": CheckSquare,
  bell: Bell,
  "bell-ring": BellRing,
  "graduation-cap": GraduationCap,
  inbox: Inbox,
  "life-buoy": LifeBuoy,
  timer: Timer,
  "layout-dashboard": LayoutDashboard,
  "upload-cloud": UploadCloud,
  "sticky-note": StickyNote,
  layers: Layers,
  info: Info,
  user: User,
  settings: Settings,
  "book-open": BookOpen,
  brain: Brain,
  "calendar-check": CalendarCheck,
  zap: Zap,
  flame: Flame,
  "tree-pine": TreePine,
  shield: Shield,
  gauge: Gauge,
};

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const Icon = iconMap[item.icon] || Calendar;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      prefetch
      onClick={() => onNavigate?.()}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-[0_4px_14px_-4px_var(--sidebar-primary)]"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary-foreground/80" />
      )}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-sidebar-primary-foreground")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && item.badge > 0 && (
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
            isActive
              ? "bg-sidebar-primary-foreground/90 text-sidebar-primary"
              : "bg-sidebar-primary text-sidebar-primary-foreground"
          )}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5",
          isActive ? "text-sidebar-primary-foreground/60" : "text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60"
        )}
      />
    </Link>
  );
}

// matchMedia must not be read during render — the server has no window, so
// SSR and hydration would disagree. useSyncExternalStore resolves it after
// hydration with the server snapshot ("desktop") used for the initial render.
function subscribeDesktop(listener: () => void) {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

function getDesktopSnapshot(): boolean {
  return window.matchMedia("(min-width: 768px)").matches;
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, signOut } = useAuth();

  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => true);

  const u = user as
    | {
        firstName?: string;
        lastName?: string;
        email?: string;
        image?: string;
        avatarUrl?: string;
        isAdmin?: boolean;
      }
    | null
    | undefined;

  const pathname = usePathname();
  const isSettings = pathname === "/settings";

  // On mobile the primary destinations live in the Bottom Navigation,
  // so the drawer only shows secondary tools/account items + admin (for admins).
  const visibleGroups = isDesktop
    ? navGroups
    : navGroups.filter(
        (g) => g.title === "Tools" || (g.adminOnly && u?.isAdmin)
      );

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-foreground/80 bg-sidebar/95 shadow-[3px_3px_0_0_#401f32] backdrop-blur-xl">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border/70 px-5">
        <Image src="/images/logo.jpg" alt="" aria-hidden width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-sidebar-border" />
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          Schedly
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Hide sidebar"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <div key={group.title} className="mb-4">
            {(group.adminOnly ? u?.isAdmin : true) && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/30">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items
                .filter((item) => !item.adminOnly || u?.isAdmin)
                .map((item) => (
                  <NavItemLink key={item.href} item={item} onNavigate={onClose} />
                ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Theme Picker */}
      <ThemePicker />

      {/* Level / streak / XP used to live here. Moved to the profile sheet
          (Schedly Stats): the sidebar shows on every dashboard page and is the
          first thing to go when the window narrows, and a static block of four
          zeros was taking vertical space that navigation needed. It also fired
          a `getGamificationProfile()` server action on every single page load
          for a value most people never look at. */}

      {/* User */}
      <div className="px-4 pb-4 space-y-1.5">
        <Link
          href="/settings"
          prefetch
          onClick={() => onClose?.()}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border-2 border-foreground/80 bg-sidebar-accent/60 px-3 py-2.5 shadow-[3px_3px_0_0_#401f32] transition-all hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-sidebar-accent",
            isSettings && "bg-sidebar-accent text-sidebar-primary"
          )}
        >
          <Settings className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/70" />
          <span className="flex-1 truncate text-left text-sm font-medium text-sidebar-foreground">
            Settings
          </span>
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="group flex w-full items-center gap-3 rounded-xl border-2 border-foreground/80 bg-sidebar-accent/60 px-3 py-2.5 text-left shadow-[3px_3px_0_0_#401f32] transition-all hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-sidebar-accent"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-sidebar-foreground/70 transition-colors group-hover:text-destructive" />
          <span className="flex-1 truncate text-left text-sm font-medium text-sidebar-foreground">
            Sign out
          </span>
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border/70 px-5 py-3">
        <p className="text-[11px] text-sidebar-foreground/30">Schedly v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
