import { getGamificationProfile } from "./gamification-actions";
import { PomodoroView } from "./pomodoro-view";

// Reads the session, so this must never be served from a cache.
export const dynamic = "force-dynamic";

/**
 * Resolves the gamification profile on the server and hands it to the client
 * view.
 *
 * The profile used to be fetched from a mount effect inside the client page,
 * which meant a second round-trip after hydration: the timer painted first and
 * the XP/Lv/streak line popped in a beat later, so the card visibly reflowed
 * for no reason. Awaiting it here puts it in the server render, so the stats
 * ship inside the initial HTML and appear on the same frame as everything else.
 */
export default async function PomodoroPage() {
  const profile = await getGamificationProfile();

  return (
    <PomodoroView
      initialProfile={
        profile
          ? {
              xp: profile.xp,
              level: profile.level,
              currentStreak: profile.currentStreak,
              totalFocusMinutes: profile.totalFocusMinutes,
            }
          : null
      }
    />
  );
}
