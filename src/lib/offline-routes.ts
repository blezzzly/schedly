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

/**
 * Version of the cache the worker builds. Must equal CACHE_NAME in public/sw.js.
 *
 * This exists because of a trap worth writing down. When the worker's cache name
 * changes, its `activate` handler deletes every older cache — that is what makes
 * a new build actually ship. It also wipes all the pages precached by the
 * previous version, which is correct and expected.
 *
 * The "already precached" marker has to move with it. If that marker is not
 * versioned, an upgrade leaves the device in a state where the cache is empty
 * but the app still believes precaching finished, so it never runs again. Every
 * offline navigation then finds nothing cached and lands on the offline screen —
 * permanently, and with no way for the user to fix it.
 *
 * Bump this whenever the worker's CACHE_NAME is bumped.
 */
export const OFFLINE_CACHE_VERSION = "v7";

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