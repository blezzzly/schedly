export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  adminOnly?: boolean;
  /** Shown in the bottom navigation (primary destinations) */
  primary?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/** Primary destinations — shown in the Bottom Navigation (mobile). */
export const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", primary: true },
  { label: "Classes", href: "/classes", icon: "calendar", primary: true },
  { label: "To-Do List", href: "/todo", icon: "check-square", primary: true },
  { label: "Pomodoro", href: "/pomodoro", icon: "timer", primary: true },
];

/**
 * Sidebar (Navigation Drawer) groups.
 * On desktop these are shown in full (primary + secondary).
 * On mobile the primary items are omitted (they live in the Bottom Nav)
 * and account actions stay in the user menu.
 */
export const navGroups: NavGroup[] = [
  {
    title: "Main",
    items: primaryNav,
  },
  {
    title: "Tools",
    items: [
      { label: "Notes", href: "/notes", icon: "sticky-note" },
      { label: "Flashcards", href: "/flashcards", icon: "brain" },
      { label: "Planner", href: "/planner", icon: "calendar-check" },
      { label: "Syllabus", href: "/syllabus", icon: "book-open" },
      { label: "GWA Calculator", href: "/gwa", icon: "graduation-cap" },
    ],
  },
];

// Flattened, deduped list of every sidebar destination. navGroups[0] is
// already `primaryNav`, so spreading primaryNav first would duplicate the
// primary items (React key collisions). flatMap keeps each href once.
export const mainNav: NavItem[] = navGroups.flatMap((g) => g.items);
