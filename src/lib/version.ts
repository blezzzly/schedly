/**
 * The version string shown in the app UI.
 *
 * Deliberately its own constant rather than a literal in the sidebar: that
 * footer used to read a hardcoded "Schedly v0.1.0" while `package.json` had
 * moved on to 1.2.0, so the two silently disagreed and nothing pointed at the
 * stale copy. Keeping it here makes it a single greppable line — if you bump
 * one, bump the other.
 *
 * Not to be confused with the update-check version in
 * `releases/version.json` (Backblaze B2), which is a separate
 * `versionCode`/`versionName` pair served by `/api/version`. Nothing in the
 * client currently reads that response for an update prompt.
 */
export const APP_VERSION = "1.2.12";
