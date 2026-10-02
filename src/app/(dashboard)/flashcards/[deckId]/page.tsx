"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  getFlashcardDeck,
  addCard,
  updateCard,
  deleteCard,
  updateDeck,
  deleteDeck,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { friendlyError } from "@/server/lib/friendly-error";
import {
  PlusIcon,
  TrashIcon,
  EditIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  MoreVerticalIcon,
  MessageSquareIcon,
  CheckCircleIcon,
  FlameIcon,
} from "lucide-react";

type CardType = {
  id: string;
  front: string;
  back: string;
  streak: number;
  difficulty: number;
};

type Deck = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  cardCount: number;
  cards: CardType[];
};

export default function DeckDetailPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = use(params);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [editCard, setEditCard] = useState<CardType | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [deletingCard, setDeletingCard] = useState(false);
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFlashcardDeck(deckId);
      if (!data) {
        toast.error("Deck not found");
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

  function openAddCard() {
    setFront("");
    setBack("");
    setEditCard(null);
    setShowAddCard(true);
  }

  function openEditCard(card: CardType) {
    setFront(card.front);
    setBack(card.back);
    setEditCard(card);
    setShowAddCard(true);
    setShowMenu(false);
  }

  async function handleSaveCard() {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    if (editCard) {
      const result = await updateCard(editCard.id, front, back);
      setSaving(false);
      if (result.success) {
        toast.success("Card updated");
        setShowAddCard(false);
        load();
      } else {
        toast.error(friendlyError(result.error, "flashcard"));
      }
    } else {
      const result = await addCard(deckId, front, back);
      setSaving(false);
      if (result.success) {
        toast.success("Card added");
        setFront("");
        setBack("");
        load();
      } else {
        toast.error(friendlyError(result.error, "flashcard"));
      }
    }
  }

  async function handleDeleteCard() {
    if (!deleteCardId) return;
    setDeletingCard(true);
    const result = await deleteCard(deleteCardId);
    setDeletingCard(false);
    if (result.success) {
      toast.success("Card deleted");
      setDeleteCardId(null);
      load();
    }
  }

  function openEditDeck() {
    if (!deck) return;
    setEditTitle(deck.title);
    setEditDesc(deck.description || "");
    setEditSubject(deck.subject || "");
    setShowEditDeck(true);
    setShowMenu(false);
  }

  async function handleSaveDeck() {
    if (!editTitle.trim()) return;
    setSaving(true);
    const result = await updateDeck(deckId, editTitle, editDesc, editSubject);
    setSaving(false);
    if (result.success) {
      toast.success("Deck updated");
      setShowEditDeck(false);
      load();
    } else {
      toast.error(friendlyError(result.error, "save"));
    }
  }

  async function handleDeleteDeck() {
    setShowMenu(false);
    const result = await deleteDeck(deckId);
    if (result.success) {
      toast.success("Deck deleted");
      window.location.href = "/flashcards";
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Deck not found</p>
        <Link href="/flashcards">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="mr-1.5 h-4 w-4" />
            Back to Decks
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pt-8 pb-24 md:pt-0 md:pb-8">
      <div className="flex items-center gap-3">
        <Link href="/flashcards">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {deck.title}
          </h1>
          {deck.description && (
            <p className="text-sm text-muted-foreground">{deck.description}</p>
          )}
        </div>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </Button>
          {showMenu && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border bg-popover shadow-md">
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent rounded-t-lg"
                onClick={openEditDeck}
              >
                Edit Deck
              </button>
              <button
                className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent rounded-b-lg"
                onClick={handleDeleteDeck}
              >
                Delete Deck
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {deck.cards.length} card{deck.cards.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          {deck.cards.length > 0 && (
            <Link href={`/flashcards/${deckId}/study`}>
              <Button size="sm" variant="secondary">
                <BookOpenIcon className="mr-1.5 h-4 w-4" />
                Study
              </Button>
            </Link>
          )}
          <Button size="sm" onClick={openAddCard}>
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Add Card
          </Button>
        </div>
      </div>

      {deck.cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">No cards yet</p>
            <Button onClick={openAddCard} className="mt-3" size="sm">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Add First Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deck.cards.map((card, index) => (
            <Card key={card.id} className="group transition-colors hover:border-primary/30">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <MessageSquareIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <p className="text-sm font-medium leading-relaxed text-foreground">
                        {card.front}
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5 pl-0 border-l-2 border-primary/30 pl-3">
                      <CheckCircleIcon className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {card.back}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {card.streak > 0 && (
                      <span className="flex items-center gap-1 text-xs font-medium text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
                        <FlameIcon className="h-3 w-3" />
                        {card.streak}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditCard(card)}
                        title="Edit"
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteCardId(card.id)}
                        title="Delete"
                      >
                        <TrashIcon className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCard ? "Edit Card" : "Add Card"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Front (Question)
              </p>
              <textarea
                value={front}
                onChange={(e) => setFront(e.target.value)}
                placeholder="Enter the question or term..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Back (Answer)
              </p>
              <textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder="Enter the answer or definition..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSaveCard}
              disabled={!front.trim() || !back.trim() || saving}
            >
              {saving ? <Spinner size={16} className="mr-2" /> : null}
              {editCard ? "Save Changes" : "Add Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteCardId} onOpenChange={() => setDeleteCardId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete card?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This card will be permanently deleted.
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleDeleteCard}
              disabled={deletingCard}
            >
              {deletingCard ? <Spinner size={16} className="mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDeck} onOpenChange={setShowEditDeck}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Deck</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <TextField
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <TextField
              label="Description"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
            <TextField
              label="Subject"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleSaveDeck}
              disabled={!editTitle.trim() || saving}
            >
              {saving ? <Spinner size={16} className="mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
