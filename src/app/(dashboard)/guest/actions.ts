"use server";

import { headers } from "next/headers";
import { db } from "@/server/db/client";
import { auth } from "@/server/lib/auth";
import { auditLog } from "@/server/lib/audit";

/**
 * Hand a guest account's data over to the signed-in real account.
 *
 * Called right after sign-in/sign-up when localStorage still remembers the
 * guest id from this device, so nothing a guest created is lost when they
 * decide to sign up. The throwaway user row is deleted afterwards, which
 * cascades away its sessions and any leftovers.
 *
 * Safe to call repeatedly: once the guest row is gone every step is a no-op
 * and the client clears its marker.
 */

type ClaimResult = { claimed: boolean; reason?: string };

export async function claimGuestAccount(guestId: string): Promise<ClaimResult> {
  if (!guestId) return { claimed: false, reason: "missing-guest-id" };

  const session = await auth.api.getSession({ headers: await headers() });
  const realUserId = session?.user?.id;
  if (!realUserId) return { claimed: false, reason: "not-authenticated" };

  // Only ever claim a row that is actually flagged as a guest, so a crafted
  // id can't be used to pull another real user's data across.
  const guest = await db.user.findUnique({
    where: { id: guestId },
    select: { id: true, isAnonymous: true },
  });
  if (!guest?.isAnonymous) return { claimed: false, reason: "guest-not-found" };
  if (guest.id === realUserId) return { claimed: false, reason: "already-claimed" };

  try {
    await db.$transaction(async (tx) => {
      // The transaction client is typed as
      // `Omit<PrismaClient, ITXClientDenyList>`, which hides every model, so
      // `tx.schedule` is a TS2339. This cast is the established workaround in
      // this codebase — see schedule.service.ts and flashcards/actions.ts.
      const t = tx as typeof db;

      // Written out one call per model so each one stays individually typed.
      // Flashcard and Class rows are intentionally absent — they hang off
      // FlashcardDeck / Schedule, which move below, so they follow along.
      await t.schedule.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.upload.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.reminder.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.todo.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.notification.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.flashcardDeck.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.focusSession.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.noteFolder.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.note.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.plannerEntry.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.pushSubscription.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      // Prisma capitalises this one: fCMToken, not fcmToken.
      await t.fCMToken.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.syllabus.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });
      await t.feedback.updateMany({ where: { userId: guest.id }, data: { userId: realUserId } });

      // flashcard_progress is @@unique([cardId, userId]). If the real user
      // already has progress for a card the guest also reviewed, keep the
      // real user's row and drop the guest's rather than blowing up on a
      // unique violation.
      const guestProgress = await t.flashcardProgress.findMany({
        where: { userId: guest.id },
        select: { id: true, cardId: true },
      });
      for (const row of guestProgress) {
        const existing = await t.flashcardProgress.findUnique({
          where: { cardId_userId: { cardId: row.cardId, userId: realUserId } },
          select: { id: true },
        });
        if (existing) {
          await t.flashcardProgress.delete({ where: { id: row.id } });
        } else {
          await t.flashcardProgress.update({
            where: { id: row.id },
            data: { userId: realUserId },
          });
        }
      }

      // user_profile is @unique on userId — same conflict rule as above.
      const guestProfile = await t.userProfile.findUnique({
        where: { userId: guest.id },
        select: { id: true },
      });
      if (guestProfile) {
        const realProfile = await t.userProfile.findUnique({
          where: { userId: realUserId },
          select: { id: true },
        });
        if (realProfile) {
          await t.userProfile.delete({ where: { id: guestProfile.id } });
        } else {
          await t.userProfile.update({
            where: { id: guestProfile.id },
            data: { userId: realUserId },
          });
        }
      }
    });
  } catch (err) {
    // The guest row is deliberately left in place so the client can retry
    // rather than silently dropping someone's schedule.
    console.error("[CLAIM] Failed to move guest data:", err);
    return { claimed: false, reason: "migration-failed" };
  }

  // Cascades the guest's sessions and any rows we didn't explicitly move.
  await db.user.delete({ where: { id: guest.id } }).catch(() => undefined);

  auditLog("user.guest_claim", { guestId: guest.id, realUserId });

  return { claimed: true };
}
