"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { levelFromXp } from "@/lib/gamification-levels";

const FOCUS_XP_PER_MINUTE = 1;
const TASK_XP = 15; // XP earned per completed task
const FLASHCARD_XP_PER_REVIEW = 2; // XP earned per reviewed flashcard (regardless of rating)

/**
 * The level is DERIVED from the XP total everywhere it's displayed, rather than
 * read back from the `level` column.
 *
 * That column could only ever ratchet upward (`if (newLevel > profile.level)`),
 * so the off-by-one in the old XP table left every existing account stuck a
 * level too high, permanently. Deriving on read makes those rows self-heal the
 * moment anyone looks at their profile, with no migration and no backfill — and
 * it means a drifted column can never again disagree with the number on screen.
 */
function calcLevel(xp: number): number {
  return levelFromXp(xp);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Recompute the level from the XP total and write it back to the `level`
 * column, returning the level.
 *
 * Each of the three XP paths (focus, task, flashcard) used to inline this
 * behind `if (newLevel > profile.level)`, a one-way ratchet: the level could
 * only ever go up. Combined with the off-by-one in the old XP table, that left
 * existing accounts permanently pinned a level too high with no way to recover.
 * Writing unconditionally is the same single-row update and lets a wrong value
 * correct itself on the next XP event.
 *
 * The number shown to users is derived from XP, not read from this column, so
 * the column is bookkeeping — but it should still be truthful.
 */
async function syncLevel(userId: string): Promise<number> {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { xp: true, level: true },
  });
  if (!profile) return 1;

  const newLevel = calcLevel(profile.xp);
  if (newLevel !== profile.level) {
    await db.userProfile.update({ where: { userId }, data: { level: newLevel } });
  }
  return newLevel;
}

export async function getGamificationProfile() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  try {

  let profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      xp: true,
      level: true,
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
      totalFocusMinutes: true,
    },
  });

  if (!profile) {
    profile = await db.userProfile.create({
      data: { userId: session.user.id },
    });
  }

  // Streak updates every 23 hours on app open (when this function is called)
  const now = new Date();
  const lastActive = profile.lastActiveDate ? new Date(profile.lastActiveDate) : null;
  const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000;
  const hoursSinceActive = lastActive ? now.getTime() - lastActive.getTime() : Infinity;

  if (hoursSinceActive >= TWENTY_THREE_HOURS) {
    const streakContinues = hoursSinceActive < 48 * 60 * 60 * 1000 && lastActive !== null;

    await db.userProfile.update({
      where: { userId: session.user.id },
      data: {
        lastActiveDate: now.toISOString(),
        currentStreak: streakContinues ? profile.currentStreak + 1 : 1,
        longestStreak: Math.max(
          profile.longestStreak,
          streakContinues ? profile.currentStreak + 1 : 1,
        ),
      },
    });

    return {
      xp: profile.xp,
      level: calcLevel(profile.xp),
      currentStreak: streakContinues ? profile.currentStreak + 1 : 1,
      longestStreak: Math.max(
        profile.longestStreak,
        streakContinues ? profile.currentStreak + 1 : 1,
      ),
      totalFocusMinutes: profile.totalFocusMinutes,
    };
  }

  return {
    xp: profile.xp,
    level: calcLevel(profile.xp),
    currentStreak: profile.currentStreak,
    longestStreak: profile.longestStreak,
    totalFocusMinutes: profile.totalFocusMinutes,
  };
  } catch {
    return null;
  }
}

export async function logFocusSession(durationMinutes: number, completed: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  if (durationMinutes < 1 || durationMinutes > 480) {
    return { success: false, error: "Invalid duration" };
  }

  const xpEarned = completed ? Math.round(durationMinutes * FOCUS_XP_PER_MINUTE) : 0;

  try {
    // Idempotency guard: prevent duplicate completion records if the same
    // completion fires twice within a short window (e.g. double click, refresh
    // during a natural completion, or a stale client tab). Partial sessions
    // (completed=false) are allowed multiple times.
    if (completed) {
      const sixtySecondsAgo = new Date(Date.now() - 60_000);
      const recent = await db.focusSession.findFirst({
        where: {
          userId: session.user.id,
          completed: true,
          startedAt: { gte: sixtySecondsAgo },
        },
        orderBy: { startedAt: "desc" },
        select: { id: true, xpEarned: true },
      });
      if (recent) {
        return { success: true, xpEarned: recent.xpEarned, deduplicated: true };
      }
    }

    await db.focusSession.create({
      data: {
        userId: session.user.id,
        duration: durationMinutes,
        completed,
        xpEarned,
        completedAt: completed ? new Date() : null,
      },
    });

    if (xpEarned > 0) {
      await db.userProfile.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          xp: xpEarned,
          level: 1,
          totalFocusMinutes: durationMinutes,
          lastActiveDate: todayKey(),
        },
        update: {
          xp: { increment: xpEarned },
          totalFocusMinutes: { increment: durationMinutes },
          lastActiveDate: todayKey(),
        },
      });

      await syncLevel(session.user.id);
    }

    return { success: true, xpEarned };
  } catch (err) {
    console.error("[LOG_FOCUS]", err);
    return { success: false, error: "Failed to log session" };
  }
}

export async function logTaskCompleted() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;

  try {
    await db.userProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        xp: TASK_XP,
        level: 1,
        totalTasksCompleted: 1,
        lastActiveDate: todayKey(),
      },
      update: {
        xp: { increment: TASK_XP },
        totalTasksCompleted: { increment: 1 },
        lastActiveDate: todayKey(),
      },
    });

    await syncLevel(session.user.id);
  } catch (err) {
    console.error("[LOG_TASK]", err);
  }
}

export async function logFlashcardReview(
  cardsReviewed: number,
  options?: { deckId?: string; cardIds?: string[] }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };
  if (cardsReviewed < 1) return { success: false, error: "Invalid count" };

  try {
    // Determine which card IDs are new (never reviewed before in any session).
    // Re-studying a deck with Study Again shouldn't re-grant XP for the same cards.
    let billableCount = cardsReviewed;
    if (options?.cardIds && options.cardIds.length > 0) {
      const reviewedBefore = await db.flashcardProgress.findMany({
        where: {
          userId: session.user.id,
          cardId: { in: options.cardIds },
        },
        select: { cardId: true },
      });
      const reviewedSet = new Set(reviewedBefore.map((r: { cardId: string }) => r.cardId));
      billableCount = options.cardIds.filter((id) => !reviewedSet.has(id)).length;
    }

    const prevProfile = await db.userProfile.findUnique({ where: { userId: session.user.id } });
    const prevLevel = prevProfile?.level ?? 1;

    const xpEarned = billableCount * FLASHCARD_XP_PER_REVIEW;
    if (xpEarned > 0) {
      await db.userProfile.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          xp: xpEarned,
          level: 1,
          lastActiveDate: todayKey(),
        },
        update: {
          xp: { increment: xpEarned },
          lastActiveDate: todayKey(),
        },
      });
    }

    const profile = await db.userProfile.findUnique({ where: { userId: session.user.id } });
    let newLevel = prevLevel;
    if (profile) {
      newLevel = await syncLevel(session.user.id);
    }

    return { success: true, xpEarned, newLevel, leveledUp: newLevel > prevLevel };
  } catch (err) {
    console.error("[LOG_FLASHCARD]", err);
    return { success: false, error: "Failed to log review" };
  }
}

export async function getRecentFocusSessions(limit = 7) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  try {
    return await db.focusSession.findMany({
      where: { userId: session.user.id },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}
