"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";

export async function getFlashcardDecks() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  try {
    const [decks, profile] = await Promise.all([
      db.flashcardDeck.findMany({
        where: { userId: session.user.id },
        select: {
          id: true,
          title: true,
          description: true,
          subject: true,
          cardCount: true,
          createdAt: true,
          updatedAt: true,
          cards: {
            select: {
              id: true,
              progress: {
                where: { userId: session.user.id },
                select: { status: true, lastStudiedAt: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.userProfile.findUnique({
        where: { userId: session.user.id },
        select: { xp: true, level: true },
      }),
    ]);

    return decks.map((deck) => {
      const cardsWithProgress = deck.cards.map((card) => {
        const p = card.progress[0] ?? { status: "new" as const, lastStudiedAt: null };
        return { status: p.status, lastStudiedAt: p.lastStudiedAt };
      });
      const masteredCount = cardsWithProgress.filter((c) => c.status === "mastered").length;
      const progressPct = deck.cardCount > 0 ? Math.round((masteredCount / deck.cardCount) * 100) : 0;
      const lastStudied = cardsWithProgress
        .filter((c) => c.lastStudiedAt)
        .sort((a, b) => new Date(b.lastStudiedAt!).getTime() - new Date(a.lastStudiedAt!).getTime())[0]?.lastStudiedAt ?? null;

      return {
        id: deck.id,
        title: deck.title,
        description: deck.description,
        subject: deck.subject,
        cardCount: deck.cardCount,
        masteredCount,
        progressPct,
        lastStudiedAt: lastStudied,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        xp: profile?.xp ?? 0,
        level: profile?.level ?? 1,
      };
    });
  } catch (err) {
    console.error("[GET_FLASHCARD_DECKS]", err);
    return [];
  }
}

export async function getFlashcardDeck(deckId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  try {
    return await db.flashcardDeck.findFirst({
      where: { id: deckId, userId: session.user.id },
      select: {
        id: true,
        title: true,
        description: true,
        subject: true,
        cardCount: true,
        cards: {
          select: {
            id: true,
            front: true,
            back: true,
            streak: true,
            difficulty: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  } catch {
    return null;
  }
}

export async function createDeck(
  title: string,
  description: string,
  subject: string,
  syllabusId?: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = title.trim();
  if (!clean) return { success: false, error: "Title is required" };
  if (clean.length > 100) return { success: false, error: "Title too long" };

  try {
    const deck = await db.flashcardDeck.create({
      data: {
        userId: session.user.id,
        title: clean,
        description: description.trim() || null,
        subject: subject.trim() || null,
        syllabusId: syllabusId || null,
      },
    });
    return { success: true, deckId: deck.id };
  } catch (err) {
    console.error("[CREATE_DECK]", err);
    return { success: false, error: "Failed to create deck" };
  }
}

export async function updateDeck(
  deckId: string,
  title: string,
  description: string,
  subject: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const existing = await db.flashcardDeck.findFirst({
      where: { id: deckId, userId: session.user.id },
    });
    if (!existing) return { success: false, error: "Deck not found" };

    await db.flashcardDeck.update({
      where: { id: deckId },
      data: {
        title: title.trim() || existing.title,
        description: description.trim() || null,
        subject: subject.trim() || null,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[UPDATE_DECK]", err);
    return { success: false, error: "Failed to update deck" };
  }
}

export async function deleteDeck(deckId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.flashcardDeck.deleteMany({
      where: { id: deckId, userId: session.user.id },
    });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_DECK]", err);
    return { success: false };
  }
}

export async function addCard(deckId: string, front: string, back: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const f = front.trim();
  const b = back.trim();
  if (!f) return { success: false, error: "Front side is required" };
  if (!b) return { success: false, error: "Back side is required" };

  try {
    const existing = await db.flashcardDeck.findFirst({
      where: { id: deckId, userId: session.user.id },
    });
    if (!existing) return { success: false, error: "Deck not found" };

    await db.flashcard.create({
      data: { deckId, front: f, back: b },
    });
    await db.flashcardDeck.update({
      where: { id: deckId },
      data: { cardCount: { increment: 1 } },
    });
    return { success: true };
  } catch (err) {
    console.error("[ADD_CARD]", err);
    return { success: false, error: "Failed to add card" };
  }
}

export async function updateCard(
  cardId: string,
  front: string,
  back: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const card = await db.flashcard.findFirst({
      where: { id: cardId },
      include: { deck: { select: { userId: true } } },
    });
    if (!card || card.deck.userId !== session.user.id) {
      return { success: false, error: "Card not found" };
    }

    await db.flashcard.update({
      where: { id: cardId },
      data: { front: front.trim(), back: back.trim() },
    });
    return { success: true };
  } catch (err) {
    console.error("[UPDATE_CARD]", err);
    return { success: false, error: "Failed to update card" };
  }
}

export async function deleteCard(cardId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const card = await db.flashcard.findFirst({
      where: { id: cardId },
      include: { deck: { select: { id: true, userId: true } } },
    });
    if (!card || card.deck.userId !== session.user.id) {
      return { success: false };
    }

    await db.flashcard.delete({ where: { id: cardId } });
    await db.flashcardDeck.update({
      where: { id: card.deck.id },
      data: { cardCount: { decrement: 1 } },
    });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_CARD]", err);
    return { success: false };
  }
}

export async function reviewCard(cardId: string, correct: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const card = await db.flashcard.findFirst({
      where: { id: cardId },
      include: { deck: { select: { userId: true } } },
    });
    if (!card || card.deck.userId !== session.user.id) {
      return { success: false };
    }

    const newStreak = correct ? card.streak + 1 : 0;
    const intervalMinutes = correct
      ? Math.min(1440 * Math.pow(2, newStreak), 10080)
      : 5;
    const nextReview = new Date(Date.now() + intervalMinutes * 60 * 1000);

    await db.flashcard.update({
      where: { id: cardId },
      data: {
        streak: newStreak,
        difficulty: correct ? card.difficulty : card.difficulty + 1,
        lastReviewed: new Date(),
        nextReview,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[REVIEW_CARD]", err);
    return { success: false };
  }
}

export async function getDecksBySyllabus(syllabusId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  try {
    return await db.flashcardDeck.findMany({
      where: { userId: session.user.id, syllabusId },
      select: {
        id: true,
        title: true,
        description: true,
        subject: true,
        cardCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    return [];
  }
}

export async function createDeckFromSyllabus(
  syllabusId: string,
  title: string,
  description: string,
  subject: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  // Verify syllabus belongs to user
  const syllabus = await db.syllabus.findFirst({
    where: { id: syllabusId, userId: session.user.id },
  });
  if (!syllabus) return { success: false, error: "Syllabus not found" };

  const clean = title.trim();
  if (!clean) return { success: false, error: "Title is required" };
  if (clean.length > 100) return { success: false, error: "Title too long" };

  try {
    const deck = await db.flashcardDeck.create({
      data: {
        userId: session.user.id,
        title: clean,
        description: description.trim() || null,
        subject: subject.trim() || syllabus.courseName,
        syllabusId,
      },
    });
    return { success: true, deckId: deck.id };
  } catch (err) {
    console.error("[CREATE_DECK_FROM_SYLLABUS]", err);
    return { success: false, error: "Failed to create deck" };
  }
}

export async function saveGeneratedDeck(
  title: string,
  description: string,
  subject: string | null,
  cards: Array<{ question: string; answer: string }>
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = title.trim();
  if (!clean) return { success: false, error: "Title is required" };
  if (clean.length > 100) return { success: false, error: "Title too long" };
  if (!cards.length) return { success: false, error: "At least one card is required" };

  try {
    const deck = await db.flashcardDeck.create({
      data: {
        userId: session.user.id,
        title: clean,
        description: description.trim() || null,
        subject: subject?.trim() || null,
        cardCount: cards.length,
        cards: {
          create: cards.map((c) => ({ front: c.question, back: c.answer })),
        },
      },
    });

    // Initialize progress for each card
    const createdCards = await db.flashcard.findMany({
      where: { deckId: deck.id },
      select: { id: true },
    });
    await db.flashcardProgress.createMany({
      data: createdCards.map((c) => ({
        cardId: c.id,
        userId: session.user.id,
        status: "new",
        studyCount: 0,
        correctCount: 0,
        wrongCount: 0,
      })),
    });

    return { success: true, deckId: deck.id };
  } catch (err) {
    console.error("[SAVE_GENERATED_DECK]", err);
    return { success: false, error: "Failed to save deck" };
  }
}

export async function getDeckProgress(deckId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  try {
  const deck = await db.flashcardDeck.findFirst({
    where: { id: deckId, userId: session.user.id },
    select: {
      id: true,
      title: true,
      cardCount: true,
      cards: {
        select: {
          id: true,
          front: true,
          back: true,
          streak: true,
          difficulty: true,
          progress: {
            where: { userId: session.user.id },
            select: {
              status: true,
              studyCount: true,
              correctCount: true,
              wrongCount: true,
              lastStudiedAt: true,
            },
          },
        },
      },
    },
  });

  if (!deck) return null;

  const cardsWithProgress = deck.cards.map((card) => {
    const p = card.progress[0] ?? {
      status: "new",
      studyCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lastStudiedAt: null,
    };
    return {
      id: card.id,
      front: card.front,
      back: card.back,
      streak: card.streak,
      difficulty: card.difficulty,
      progress: p,
    };
  });

  const total = cardsWithProgress.length;
  const mastered = cardsWithProgress.filter((c) => c.progress.status === "mastered").length;
  const learning = cardsWithProgress.filter((c) => c.progress.status === "learning").length;
  const reviewing = cardsWithProgress.filter((c) => c.progress.status === "reviewing").length;
  const newCards = cardsWithProgress.filter((c) => c.progress.status === "new").length;
  const studied = total - newCards;
  const progressPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const lastStudied = cardsWithProgress
    .filter((c) => c.progress.lastStudiedAt)
    .sort((a, b) => new Date(b.progress.lastStudiedAt!).getTime() - new Date(a.progress.lastStudiedAt!).getTime())[0]?.progress.lastStudiedAt ?? null;

  return {
    deckId: deck.id,
    title: deck.title,
    totalCards: total,
    mastered,
    learning,
    reviewing,
    new: newCards,
    studied,
    progressPct,
    lastStudiedAt: lastStudied,
    cards: cardsWithProgress,
  };
  } catch {
    return null;
  }
}

export async function recordStudyResult(
  cardId: string,
  rating: "again" | "hard" | "good" | "easy"
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const card = await db.flashcard.findFirst({
      where: { id: cardId },
      include: {
        deck: { select: { userId: true } },
        progress: { where: { userId: session.user.id } },
      },
    });
    if (!card || card.deck.userId !== session.user.id) {
      return { success: false };
    }

    const existingProgress = card.progress[0];
    const isCorrect = rating === "good" || rating === "easy";
    const isMastered = rating === "easy";

    let newStatus: "new" | "learning" | "reviewing" | "mastered" = "learning";
    if (isMastered) newStatus = "mastered";
    else if (existingProgress?.status === "mastered") newStatus = "mastered";
    else if (existingProgress?.status === "reviewing" || (existingProgress?.studyCount ?? 0) > 2) newStatus = "reviewing";
    else newStatus = "learning";

    const newStreak = isCorrect ? (card.streak + 1) : 0;
    const intervalMinutes = isCorrect
      ? Math.min(1440 * Math.pow(2, newStreak), 10080)
      : 5;
    const nextReview = new Date(Date.now() + intervalMinutes * 60 * 1000);

    await db.$transaction(async (tx) => {
      const t = tx as typeof db;
      // Update flashcard
      await t.flashcard.update({
        where: { id: cardId },
        data: {
          streak: newStreak,
          difficulty: isCorrect ? card.difficulty : card.difficulty + 1,
          lastReviewed: new Date(),
          nextReview,
        },
      });

      // Upsert progress
      await t.flashcardProgress.upsert({
        where: {
          cardId_userId: { cardId, userId: session.user.id },
        },
        create: {
          cardId,
          userId: session.user.id,
          status: newStatus,
          studyCount: 1,
          correctCount: isCorrect ? 1 : 0,
          wrongCount: isCorrect ? 0 : 1,
          lastStudiedAt: new Date(),
        },
        update: {
          status: newStatus,
          studyCount: { increment: 1 },
          correctCount: isCorrect ? { increment: 1 } : undefined,
          wrongCount: isCorrect ? undefined : { increment: 1 },
          lastStudiedAt: new Date(),
        },
      });
    });

    return { success: true };
  } catch (err) {
    console.error("[RECORD_STUDY_RESULT]", err);
    return { success: false };
  }
}
