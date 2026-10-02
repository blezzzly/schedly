"use client";

/**
 * Client boundary for the icons used by the public profile page.
 *
 * `lucide-react` calls `createContext` at module scope for its icon context
 * hook. It ships no "use client" banner, so when a Server Component imports it
 * the module is evaluated under the `react-server` condition — where
 * `createContext` does not exist. That throws
 * `TypeError: createContext is not a function` and fails `next build` while
 * collecting page data for /u/[username].
 *
 * Re-exporting from a "use client" module puts the boundary here, so the page
 * itself can stay an async Server Component (it awaits a database query) while
 * the icons become ordinary client references.
 */
export {
  GraduationCap,
  BookOpen,
  Award,
  MapPin,
  Calendar,
} from "lucide-react";
