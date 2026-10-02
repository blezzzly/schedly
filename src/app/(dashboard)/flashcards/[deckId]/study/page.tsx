"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { getFlashcardDeck, recordStudyResult, getDeckProgress } from "../../actions";
import { logFlashcardReview } from "@/app/(dashboard)/pomodoro/gamification-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  RotateCcwIcon,
  CheckIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BrainIcon,
  TrophyIcon,
  CheckCircleIcon,
  FlameIcon,
} from "lucide-react";

type CardType = {
  id: string;
  front: string;
  back: string;
  streak: number;
};

type Deck = {
  id: string;
  title: string;
  cards: CardType[];
};

export default function StudyPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = use(params);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, again: 0, hard: 0, good: 0, easy: 0 });

  const load = useCallback(async () => {
    try {
      const data = await getFlashcardDeck(deckId);
      if (!data || (data as Deck).cards.length === 0) {
        toast.error("No cards to study");
        return;
      }
      setDeck(data as Deck);
    } catch {
      toast.error("Failed to load deck");
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const cards = deck?.cards ?? [];
  const total = cards.length;
  const current = cards[currentIndex];
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  const [xpAwarded, setXpAwarded] = useState(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState(0);

  useEffect(() => {
    if (currentIndex >= total && total > 0 && xpAwarded === 0) {
      const reviewed = sessionStats.again + sessionStats.hard + sessionStats.good + sessionStats.easy;
      if (reviewed > 0) {
        void (async () => {
          const result = await logFlashcardReview(reviewed, {
            deckId,
            cardIds: cards.map((c) => c.id),
          });
          if (result.success && result.xpEarned) {
            setXpAwarded(result.xpEarned);
            if (result.leveledUp && result.newLevel) {
              setLeveledUp(true);
              setNewLevel(result.newLevel);
            }
          }
        })();
      }
    }
  }, [currentIndex, total, sessionStats, xpAwarded]);

  async function handleReview(rating: "again" | "hard" | "good" | "easy") {
    if (!current) return;
    const isCorrect = rating === "good" || rating === "easy";
    setSessionStats((s) => ({
      ...s,
      correct: s.correct + (isCorrect ? 1 : 0),
      wrong: s.wrong + (isCorrect ? 0 : 1),
      [rating]: s[rating] + 1,
    }));
    await recordStudyResult(current.id, rating);

    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
    } else {
      setCurrentIndex(total);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setFlipped(false);
    }
  }

  function restart() {
    setCurrentIndex(0);
    setFlipped(false);
    setSessionStats({ correct: 0, wrong: 0, again: 0, hard: 0, good: 0, easy: 0 });
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!deck || total === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No cards to study</p>
        <Link href={`/flashcards/${deckId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="mr-1.5 h-4 w-4" />
            Back to Deck
          </Button>
        </Link>
      </div>
    );
  }

  if (currentIndex >= total) {
    const pct = sessionStats.correct + sessionStats.wrong > 0
      ? Math.round((sessionStats.correct / (sessionStats.correct + sessionStats.wrong)) * 100)
      : 0;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {pct >= 80 ? (
              <TrophyIcon className="h-8 w-8 text-primary" />
            ) : pct >= 50 ? (
              <CheckCircleIcon className="h-8 w-8 text-primary" />
            ) : (
              <FlameIcon className="h-8 w-8 text-primary" />
            )}
          </div>
          <h2 className="text-2xl font-bold mt-4">Session Complete!</h2>
          <p className="mt-2 text-muted-foreground">
            {sessionStats.correct} out of {total} correct
          </p>
        </div>

        {leveledUp ? (
          <div className="rounded-2xl border-2 border-primary bg-primary/10 px-8 py-5 text-center animate-pulse">
            <p className="text-xs font-medium text-primary uppercase tracking-wider">Level Up!</p>
            <p className="text-3xl font-bold text-primary mt-1">Lv {newLevel}</p>
            <p className="text-xs text-primary/80 mt-1">+{xpAwarded} XP earned</p>
          </div>
        ) : xpAwarded > 0 ? (
          <div className="rounded-xl border bg-primary/5 px-5 py-3 text-center">
            <p className="text-sm font-semibold text-primary">+{xpAwarded} XP earned</p>
          </div>
        ) : null}

        <div className="flex gap-3 rounded-xl border bg-muted/30 px-6 py-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">
              {sessionStats.correct}
            </p>
            <p className="text-xs text-muted-foreground">Correct</p>
          </div>
          <div className="w-px bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold text-destructive">
              {sessionStats.wrong}
            </p>
            <p className="text-xs text-muted-foreground">Wrong</p>
          </div>
          <div className="w-px bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold">{pct}%</p>
            <p className="text-xs text-muted-foreground">Score</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={restart} variant="outline">
            <RotateCcwIcon className="mr-1.5 h-4 w-4" />
            Study Again
          </Button>
          <Link href={`/flashcards/${deckId}`}>
            <Button>Done</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh-fallback min-h-dvh-fallback flex-col px-4 pt-4 pb-6 md:px-6 md:pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/flashcards/${deckId}`}>
          <Button variant="ghost" size="icon-sm">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{deck.title}</h1>
          <p className="text-xs text-muted-foreground">
            Card {currentIndex + 1} of {total}
          </p>
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        className="flex-1 cursor-pointer select-none perspective-[1000px] min-h-0"
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className={`relative h-full min-h-[280px] w-full transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 bg-card p-8 text-center shadow-lg [backface-visibility:hidden]">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">
                QUESTION
              </p>
              <p className="text-xl font-medium leading-relaxed">
                {current?.front}
              </p>
              <p className="mt-6 text-xs text-muted-foreground/60">
                Tap to reveal answer
              </p>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 text-center shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div>
              <p className="text-xs font-medium text-primary mb-3">ANSWER</p>
              <p className="text-xl font-medium leading-relaxed">{current?.back}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {flipped ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">How well did you know this?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => handleReview("again")}
              >
                <XIcon className="mr-1.5 h-4 w-4" />
                Again
              </Button>
              <Button
                variant="outline"
                className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                onClick={() => handleReview("hard")}
              >
                Hard
              </Button>
              <Button
                variant="outline"
                className="border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                onClick={() => handleReview("good")}
              >
                <CheckIcon className="mr-1.5 h-4 w-4" />
                Good
              </Button>
              <Button
                className="bg-green-500 hover:bg-green-600"
                onClick={() => handleReview("easy")}
              >
                <BrainIcon className="mr-1.5 h-4 w-4" />
                Easy
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                goPrev();
              }}
              disabled={currentIndex === 0}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                if (currentIndex < total - 1) {
                  setCurrentIndex((i) => i + 1);
                  setFlipped(false);
                }
              }}
              disabled={currentIndex >= total - 1}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
