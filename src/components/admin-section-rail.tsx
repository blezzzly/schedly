"use client";

import {
  Gauge,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Radio,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Matches how `SectionHeader` in the admin page already types its icon prop.
 * `import { type LucideIcon }` from lucide-react does not resolve as a type in
 * this setup — it lands as a namespace, so `LucideIcon` can't be used in type
 * position (TS2709). The element type is derived instead.
 */
type IconComponent = React.ComponentType<{ className?: string }>;

export type AdminSectionId =
  | "overview"
  | "feedback"
  | "users"
  | "limits"
  | "broadcast"
  | "popups";

type RailItem = {
  id: AdminSectionId;
  label: string;
  icon: IconComponent;
};

/** Order is deliberate: glance at numbers, read what users say, act on people,
 *  then the two things you only reach for deliberately (broadcasting, pop-up
 *  previews). */
const ITEMS: RailItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "feedback", label: "User Feedback", icon: MessageSquare },
  { id: "users", label: "Users", icon: Users },
  { id: "limits", label: "Service Limits", icon: Gauge },
  { id: "broadcast", label: "Broadcast", icon: Radio },
  { id: "popups", label: "Test Pop-ups", icon: Megaphone },
];

/**
 * Ubuntu-launcher-style icon rail for the admin dashboard.
 *
 * The page used to be one very long scroll: six full-width sections stacked
 * vertically, of which the 19-item feedback list and the users table dominated.
 * You had to scroll past hundreds of pixels of feedback to reach anything else,
 * and there was no way to link straight to one area.
 *
 * This switches which section is rendered rather than navigating, so it stays
 * a single page — no routes, no back button, and the already-loaded data stays
 * mounted.
 *
 * Icons only, with `title` for the native tooltip and `aria-label` for screen
 * readers, since there is no visible text label to read.
 */
export function AdminSectionRail({
  active,
  onChange,
  counts,
}: {
  active: AdminSectionId;
  onChange: (id: AdminSectionId) => void;
  /** Optional badges — the feedback count is genuinely useful at a glance. */
  counts?: Partial<Record<AdminSectionId, number>>;
}) {
  return (
    <nav
      aria-label="Admin sections"
      className="flex w-14 shrink-0 flex-col items-center gap-1 self-start rounded-2xl border-2 border-foreground/70 bg-card p-1.5 shadow-[3px_3px_0_0_#401f32] md:sticky md:top-4"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        const count = counts?.[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            title={label}
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150",
              isActive
                ? "bg-primary text-primary-foreground shadow-[2px_2px_0_0_#401f32]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {typeof count === "number" && count > 0 && (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-primary-foreground text-primary"
                    : "bg-foreground text-background",
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
