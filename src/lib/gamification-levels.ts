/**
 * The XP curve, in one place.
 *
 * `XP_PER_LEVEL[n]` is the total XP required to *reach* level n+1, so level 2
 * starts at 50 and level 3 at 150.
 *
 * The table used to be copy-pasted into four components, and it carried a
 * duplicated leading zero (`[0, 0, 50, 150, ...]`). Read as "index = level - 1"
 * that second 0 made level 2's threshold 0 XP, which produced two bugs at once:
 * `calcLevel(0)` returned 2, and `levelProgress(0, 1)` hit `next === current`
 * and rendered a full bar — so a brand-new user was told they were "100% to
 * next level" at 0 XP. The profile had a third, separate bug: it ignored this
 * curve entirely and used `xp % 100`, so every surface disagreed.
 *
 * The server that awards XP (`gamification-actions.ts`) is the source of truth
 * for the numbers; this module is the single reader of that curve, shared by
 * the profile, the dashboard card and the pomodoro page.
 */

/** Total XP required to reach level index + 1. */
export const XP_PER_LEVEL = [
  0, 50, 150, 300, 500, 750, 1050, 1400, 1800, 2250, 2750, 3300, 3900, 4550, 5250, 6000, 6800,
  7650, 8550, 9500,
] as const;

/** The level a given XP total corresponds to. Mirrors the server's `calcLevel`. */
export function levelFromXp(xp: number): number {
  for (let i = XP_PER_LEVEL.length - 1; i >= 1; i--) {
    if (xp >= (XP_PER_LEVEL[i] ?? 0)) return i + 1;
  }
  return 1;
}

/** Progress through the current level, 0–1. */
export function levelProgress(xp: number, level: number): number {
  const current = XP_PER_LEVEL[level - 1] ?? 0;
  const next = XP_PER_LEVEL[level] ?? XP_PER_LEVEL[XP_PER_LEVEL.length - 1] ?? 0;
  // Max level: no next threshold, so report full rather than dividing by zero.
  if (next <= current) return 1;
  return Math.min(1, Math.max(0, (xp - current) / (next - current)));
}

/** XP still needed to reach the next level. 0 at max level. */
export function xpToNextLevel(xp: number, level: number): number {
  const current = XP_PER_LEVEL[level - 1] ?? 0;
  const next = XP_PER_LEVEL[level] ?? XP_PER_LEVEL[XP_PER_LEVEL.length - 1] ?? 0;
  if (next <= current) return 0;
  return Math.max(0, next - xp);
}

/** "2h 5m" / "45m" — the shape the stats rows use. */
export function formatFocusTime(totalMinutes: number): string {
  const safe = Math.max(0, Math.floor(totalMinutes || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}
