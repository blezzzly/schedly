"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getFlashcardDecks,
  createDeck,
  deleteDeck,
  saveGeneratedDeck,
} from "./actions";
import { authFetch } from "@/lib/auth-fetch";
import { friendlyError } from "@/server/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TextField } from "@/components/ui/text-field";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  PlusIcon,
  TrashIcon,
  BookOpenIcon,
  LayersIcon,
  BrainIcon,
  FileIcon,
  EditIcon,
  XIcon,
  SparklesIcon,
  CheckIcon,
} from "lucide-react";

type Deck = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  cardCount: number;
  masteredCount: number;
  progressPct: number;
  lastStudiedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  xp: number;
  level: number;
};

export default function FlashcardsPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [newDeckMode, setNewDeckMode] = useState<"upload" | "manual">("upload");
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Generate from file state
  const [genFiles, setGenFiles] = useState<File[]>([]);
  const [genDeckName, setGenDeckName] = useState("");
  const [genSubject, setGenSubject] = useState("");
  const [genCardCount, setGenCardCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const genProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [genStep, setGenStep] = useState<"upload" | "review">("upload");
  type GenCard = { question: string; answer: string };
const [genCards, setGenCards] = useState<GenCard[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getFlashcardDecks();
      // For now, we'll use the deck data as-is and add progress from getDeckProgress later if needed
      setDecks(data as Deck[]);
    } catch {
      toast.error("Failed to load decks");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setGenFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setGenFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetGenerateState = () => {
    setGenFiles([]);
    setGenDeckName("");
    setGenSubject("");
    setGenCardCount(10);
    setGenerating(false);
    setGenProgress(0);
    if (genProgressRef.current) {
      clearInterval(genProgressRef.current);
      genProgressRef.current = null;
    }
    setGenStep("upload");
    setGenCards([]);
  };

  async function handleGenerate() {
    if (genFiles.length === 0 || !genDeckName.trim()) {
      toast.error("Please select at least one file and enter a deck name");
      return;
    }
    setGenerating(true);
    setGenProgress(0);

    // Fake progress animation for long operations
    genProgressRef.current = setInterval(() => {
      setGenProgress((p) => {
        if (p >= 85) {
          if (genProgressRef.current) clearInterval(genProgressRef.current);
          return 85;
        }
        return p + Math.random() * 8;
      });
    }, 500);

    try {
      const formData = new FormData();
      genFiles.forEach((file) => formData.append("files", file));
      formData.append("deckName", genDeckName.trim());
      if (genSubject.trim()) formData.append("subject", genSubject.trim());
      formData.append("cardCount", genCardCount.toString());

      const res = await authFetch("/api/flashcards/upload", {
        method: "POST",
        body: formData,
        headers: {
          "x-csrf-protection": "1",
        },
      });

      if (genProgressRef.current) {
        clearInterval(genProgressRef.current);
        genProgressRef.current = null;
      }
      setGenProgress(100);

      const data = await res.json();
      setGenerating(false);
      if (res.ok) {
        setGenCards(data.cards);
        setGenStep("review");
      } else {
        toast.error(friendlyError(data.error, "flashcard"));
      }
      } catch (err) {
      setGenerating(false);
      if (genProgressRef.current) {
        clearInterval(genProgressRef.current);
        genProgressRef.current = null;
      }
      setGenProgress(0);
      toast.error(friendlyError(err, "flashcard"));
    }
  }

  async function handleSaveGeneratedDeck() {
    if (genCards.length === 0) return;
    setGenerating(true);
    try {
      const result = await saveGeneratedDeck(
        genDeckName,
        "", // description - not collected in generate flow
        genSubject || null,
        genCards
      );
      setGenerating(false);
      if (result.success) {
        toast.success("Deck saved!");
        setShowNewDeck(false);
        resetGenerateState();
        load();
      } else {
        toast.error(friendlyError(result.error, "save"));
      }
    } catch (err) {
      setGenerating(false);
      toast.error(friendlyError(err, "save"));
    }
  }

  function updateGenCard(index: number, field: "question" | "answer", value: string) {
    const updated = [...genCards];
    const current = updated[index]!;
    updated[index] = { question: current.question, answer: current.answer, [field]: value };
    setGenCards(updated);
  }

  function deleteGenCard(index: number) {
    setGenCards(genCards.filter((_, i) => i !== index));
  }

  function addGenCard() {
    setGenCards([...genCards, { question: "", answer: "" }]);
  }

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

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const result = await createDeck(newTitle, "", newSubject);
    setCreating(false);
    if (result.success) {
      toast.success("Deck created!");
      setShowNewDeck(false);
      setNewTitle("");
      setNewSubject("");
      load();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteDeck(deleteId);
    setDeleting(false);
    if (result.success) {
      toast.success("Deck deleted");
      setDeleteId(null);
      load();
    } else {
      toast.error("Failed to delete deck");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Flashcards</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Create decks, add cards, and study smarter
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell variant="inline" className="hidden md:flex" />
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-4xl space-y-6">

      {decks.length === 0 ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="relative w-full max-w-sm rounded-2xl border-2 border-border bg-card shadow-sm p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <BrainIcon className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No decks yet</h3>
            <p className="mt-1 max-w-xs mx-auto text-sm text-muted-foreground leading-relaxed">
              Upload a file to generate, or create one manually.
            </p>
            <div className="mt-5 flex w-full flex-row gap-3">
              <Button className="flex-1 h-11 px-6 font-medium" onClick={() => { setNewDeckMode("upload"); setShowNewDeck(true); }}>
                <SparklesIcon className="mr-2 h-4 w-4" />
                Upload File
              </Button>
              <Button variant="outline" className="flex-1 h-11 px-6 font-medium" onClick={() => { setNewDeckMode("manual"); setShowNewDeck(true); }}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Manual
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <Card
              key={deck.id}
              className="group transition-colors hover:border-primary/30"
            >
              <CardContent className="p-4">
                <Link href={`/flashcards/${deck.id}`} className="block">
                  <h3 className="font-semibold truncate pr-16">{deck.title}</h3>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <LayersIcon className="h-3.5 w-3.5" />
                      {deck.cardCount} cards
                    </span>
                    {deck.masteredCount > 0 && (
                      <span className="text-green-600 font-medium">
                        · {deck.masteredCount}/{deck.cardCount}
                      </span>
                    )}
                  </div>
                  {deck.cardCount > 0 && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${deck.progressPct}%` }}
                      />
                    </div>
                  )}
                  {deck.masteredCount > 0 && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {deck.progressPct}% mastered
                    </p>
                  )}
                </Link>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary font-medium">
                      Lv {deck.level}
                    </span>
                    <span className="text-muted-foreground">
                      {deck.xp.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/flashcards/${deck.id}/study`}>
                      <Button variant="ghost" size="icon-sm" title="Study">
                        <BookOpenIcon className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete"
                      onClick={() => setDeleteId(deck.id)}
                    >
                      <TrashIcon className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unified New Deck Dialog */}
      <Dialog open={showNewDeck} onOpenChange={(open) => { if (!open) { resetGenerateState(); setShowNewDeck(false); } else setShowNewDeck(open); }}>
        <DialogContent>

          {/* Step 1: Choose mode or review generated cards */}
          {genStep === "upload" && (
            <>
              <DialogHeader className="mb-0">
                <DialogTitle>
                  {newDeckMode === "manual" ? "New Deck" : "New Deck"}
                </DialogTitle>
                {newDeckMode === "manual" ? (
                  <p className="text-xs text-muted-foreground">
                    Create a blank deck and add cards later.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Upload files to generate flashcards.
                  </p>
                )}
              </DialogHeader>

              {/* Mode switcher */}
              <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
                <button
                  onClick={() => setNewDeckMode("upload")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    newDeckMode === "upload"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Upload
                </button>
                <button
                  onClick={() => setNewDeckMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    newDeckMode === "manual"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Manual
                </button>
              </div>

              {/* Upload mode */}
              {newDeckMode === "upload" && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="flashcard-file"
                      className="flex items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-3 py-2.5 cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                      {genFiles.length === 0 ? (
                        <span className="text-sm text-muted-foreground">Tap to select files</span>
                      ) : (
                        <span className="text-sm font-medium truncate flex-1">
                          {genFiles.length} file{genFiles.length !== 1 ? "s" : ""} selected
                        </span>
                      )}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={handleFileChange}
                        className="sr-only"
                        id="flashcard-file"
                        disabled={generating}
                        autoComplete="off"
                        multiple
                      />
                    </label>
                    {genFiles.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {genFiles.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 pl-1">
                            <span className="truncate text-xs flex-1 min-w-0 text-muted-foreground">{file.name}</span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeFile(index)}
                              disabled={generating}
                              className="h-5 w-5 shrink-0"
                            >
                              <XIcon className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1 px-1">PDF, JPG, PNG, WebP · Max 20MB · Multiple files</p>
                  </div>

                  <TextField
                    label="Deck name"
                    value={genDeckName}
                    onChange={(e) => setGenDeckName(e.target.value)}
                    placeholder="e.g., Biology Chapter 3"
                  />

                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground shrink-0">Cards:</p>
                    <div className="flex gap-1">
                      {[5, 10, 15, 20, 30].map((count) => (
                        <Button
                          key={count}
                          variant={genCardCount === count ? "default" : "outline"}
                          size="sm"
                          onClick={() => setGenCardCount(count)}
                          className="h-7 px-2 text-xs min-w-[36px]"
                        >
                          {count}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Manual mode */}
              {newDeckMode === "manual" && (
                <div className="space-y-3">
                  <TextField
                    label="Deck name"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g., Biology Chapter 3"
                  />
                  <TextField
                    label="Subject (optional)"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="e.g., Biology"
                  />
                </div>
              )}

              <DialogFooter className="flex-col gap-2">
                    {newDeckMode === "upload" && generating && (
                      <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <Spinner size={18} className="text-primary shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Creating your flashcards...</p>
                            <p className="text-xs text-muted-foreground">
                              Uploading, analyzing, and generating cards
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-primary tabular-nums">
                            {Math.round(genProgress)}%
                          </span>
                        </div>
                        <div className="mt-3">
                          <ProgressBar value={genProgress} />
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground text-center">
                          This usually takes about 10–30 seconds.
                        </p>
                      </div>
                    )}
                {newDeckMode === "upload" ? (
                  <Button
                    onClick={handleGenerate}
                    disabled={genFiles.length === 0 || !genDeckName.trim() || generating}
                    className="w-full"
                  >
                    {!generating && <SparklesIcon className="mr-1.5 h-4 w-4" />}
                    {generating ? "Generating..." : "Generate"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleCreate}
                    disabled={!newTitle.trim() || creating}
                    className="w-full"
                  >
                    {creating ? <Spinner size={14} className="mr-1.5" /> : <PlusIcon className="mr-1.5 h-4 w-4" />}
                    Create Deck
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {/* Step 2: Review generated cards */}
          {genStep === "review" && (
            <>
              <DialogHeader className="mb-0">
                <DialogTitle>Review Flashcards</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {genCards.length} cards generated · Tap to edit.
                </p>
              </DialogHeader>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto -mx-1 px-1">
                {genCards.map((card, index) => (
                  <details key={index} className="group rounded-lg border bg-card">
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none">
                      <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                      <span className="text-sm truncate flex-1">{card.question}</span>
                      <span className="text-xs text-muted-foreground/50 shrink-0 group-open:hidden">→</span>
                      <button
                        onClick={(e) => { e.preventDefault(); deleteGenCard(index); }}
                        className="shrink-0 p-0.5 hover:text-destructive"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </summary>
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Question</p>
                        <textarea
                          value={card.question}
                          onChange={(e) => updateGenCard(index, "question", e.target.value)}
                          className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                          rows={2}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Answer</p>
                        <textarea
                          value={card.answer}
                          onChange={(e) => updateGenCard(index, "answer", e.target.value)}
                          className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  </details>
                ))}
              </div>

              <DialogFooter className="flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addGenCard}
                  className="w-full"
                >
                  <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
                  Add Card
                </Button>
                <Button
                  onClick={handleSaveGeneratedDeck}
                  disabled={genCards.length === 0 || generating}
                  className="w-full"
                >
                  {generating ? <Spinner size={14} className="mr-1.5" /> : <CheckIcon className="mr-1.5 h-4 w-4" />}
                  Save Deck
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete deck?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this deck and all its cards.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Spinner size={14} className="mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
}
