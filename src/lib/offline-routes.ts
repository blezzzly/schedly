/* Every route that must work with no connection.
 *
 * A page cannot be viewed offline unless its HTML and its JS chunks were
 * downloaded first. There is no partial render and no lazy fallback: without the
 * chunks, a cached page is a blank frame. So "can I open this page without
 * internet?" is decided entirely by whether it is on this list, which is why
 * the list is here rather than inline in the layout.
 *
 * Two rules keep it honest:
 *  - Add every new page here when you add it. A route that is missing is a route
 *    that does not exist offline.
 *  - The order is the order the service worker tries when a navigation cannot
 *    be satisfied, so /dashboard comes first — it is where the app puts you.
 *
 * Routes with a dynamic segment (/syllabus/[id], /flashcards/[deckId]) are not
 * listed, and cannot be: the ids live in the database, so there is nothing to
 * fetch until the server is reachable. Those are covered differently — the
 * dashboard layout asks the worker to cache whichever route the user is
 * actually on, so one becomes available the moment it is opened while online.
 */

export const OFFLINE_ROUTES = [
  "/dashboard",
  "/classes",
  "/notes",
  "/todo",
  "/pomodoro",
  "/gwa",
  "/planner",
  "/flashcards",
  "/syllabus",
  "/notifications",
  "/settings",
  "/profile",
  "/feedback",
  "/design",
  "/admin",
  "/admin/limits",
] as const;

/**
 * Where to send someone whose navigation could not be served from cache.
 *
 * Mirrors the worker's own fallback list. `/login` is included for a signed-out
 * visitor. `/` is deliberately absent: the auth proxy redirects it to
 * /dashboard, so it would only re-enter the same fallback one hop later.
 */
export const NAV_FALLBACK_ROUTES = [
  "/dashboard",
  "/classes",
  "/notes",
  "/todo",
  "/pomodoro",
  "/notifications",
  "/gwa",
  "/planner",
  "/flashcards",
  "/syllabus",
  "/login",
] as const;