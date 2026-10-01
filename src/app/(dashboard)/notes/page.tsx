"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getNoteFolders,
  getNotes,
  createFolder,
  deleteFolder,
  createNote,
  updateNote,
  togglePin,
  deleteNote,
} from "./actions";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { Spinner } from "@/components/ui/spinner";
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
  PinIcon,
  SearchIcon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react";

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  folderId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type Folder = {
  id: string;
  name: string;
  color: string;
  _count: { notes: number };
};

const FOLDER_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function NotesPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0] ?? "#3b82f6");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showMobileFolders, setShowMobileFolders] = useState(false);

  const loadFolders = useCallback(async () => {
    const data = await getNoteFolders();
    setFolders(data as Folder[]);
  }, []);

  const loadNotes = useCallback(async () => {
    const data = selectedFolder === null
      ? await getNotes()
      : await getNotes(selectedFolder);
    setNotes(data as Note[]);
    setLoading(false);
  }, [selectedFolder]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadFolders();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFolders]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadNotes();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadNotes]);

  const filtered = searchQuery
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  function openNewNote() {
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
    setShowEditor(true);
  }

  function openEditNote(note: Note) {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
  }

  async function handleSave() {
    if (!editTitle.trim()) return;
    setSaving(true);
    if (editingNote) {
      const result = await updateNote(editingNote.id, editTitle, editContent);
      setSaving(false);
      if (result.success) {
        toast.success("Note saved");
        closeEditor();
        loadNotes();
      } else {
        toast.error(result.error);
      }
    } else {
      const result = await createNote(editTitle, editContent, selectedFolder);
      setSaving(false);
      if (result.success) {
        toast.success("Note created");
        closeEditor();
        loadNotes();
      } else {
        toast.error(result.error);
      }
    }
  }

  async function handleDeleteNote(id: string) {
    const result = await deleteNote(id);
    if (result.success) {
      toast.success("Note deleted");
      if (editingNote?.id === id) closeEditor();
      loadNotes();
    }
  }

  async function handleTogglePin(id: string) {
    await togglePin(id);
    loadNotes();
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    const result = await createFolder(newFolderName, newFolderColor);
    setCreatingFolder(false);
    if (result.success) {
      toast.success("Folder created");
      setShowNewFolder(false);
      setNewFolderName("");
      loadFolders();
    }
  }

  async function handleDeleteFolder(id: string) {
    const result = await deleteFolder(id);
    if (result.success) {
      toast.success("Folder deleted");
      if (selectedFolder === id) setSelectedFolder(null);
      loadFolders();
    }
  }

  return (
    // Page root, then header, then the nav row — the order every other page
    // uses. Notes had the nav row AS the root and the header buried inside the
    // content column, so the title landed to the right of AppNavPanel instead
    // of spanning the width above it. That is the whole reason this one page
    // never matched the rest, at any width.
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Notes
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {notes.length} note{notes.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Only offered when there is something to show. With zero folders the
              panel below is just an "All Notes" row and a New Folder button, and
              toggling it open would shift the whole page sideways for nothing. */}
          {folders.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowMobileFolders(!showMobileFolders)}
              className="md:hidden"
              aria-label="Toggle folders"
            >
              <StickyNoteIcon className="h-4 w-4" />
            </Button>
          )}
          <NotificationBell variant="inline" className="hidden md:flex" />
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-6xl space-y-6">

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Hidden while there are no folders. It is a 224px column sitting between
            the nav panel and the content, and with nothing in it the empty-state
            card was stranded 224px short of the nav instead of filling the row. */}
        {(folders.length > 0 || showMobileFolders) && (
        <div
          className={`${
            showMobileFolders ? "block" : "hidden"
          } md:block md:w-56 shrink-0 space-y-2`}
        >
          <button
            onClick={() => { setSelectedFolder(null); setLoading(true); setShowMobileFolders(false); }}
            className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              selectedFolder === null
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent text-muted-foreground"
            }`}
          >
            <StickyNoteIcon className="h-4 w-4" />
            All Notes
            <span className="ml-auto text-xs opacity-70">{notes.length}</span>
          </button>

          {folders.map((folder) => (
            <div key={folder.id} className="group flex items-center">
              <button
                onClick={() => { setSelectedFolder(folder.id); setLoading(true); setShowMobileFolders(false); }}
                className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  selectedFolder === folder.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                }`}
              >
                <div
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: folder.color }}
                />
                <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-xs opacity-70">{folder._count.notes}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={() => handleDeleteFolder(folder.id)}
              >
                <TrashIcon className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowNewFolder(true)}
          >
            <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
            New Folder
          </Button>
        </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="relative mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-background pl-10 pr-10 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={openNewNote} className="h-10 px-4 font-medium shrink-0">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              New Note
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <div className="flex w-full min-h-[19rem] flex-col items-center justify-center rounded-2xl border-2 border-foreground/70 bg-card p-6 text-center shadow-[3px_3px_0_0_#401f32]">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <StickyNoteIcon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {searchQuery ? "No matching notes" : "No notes yet"}
                </h3>
                {!searchQuery ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start by creating your first note
                    </p>
                    <Button className="mt-6 h-11 max-w-xs px-6 font-medium" onClick={openNewNote}>
                      <PlusIcon className="mr-2 h-4 w-4" />
                      Create Note
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((note) => (
                <Card
                  key={note.id}
                  className="group cursor-pointer transition-colors hover:border-primary/30"
                  onClick={() => openEditNote(note)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {note.pinned && (
                            <PinIcon className="h-3 w-3 text-primary shrink-0" />
                          )}
                          <h3 className="font-medium truncate">{note.title}</h3>
                        </div>
                        {note.content && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {note.content}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground/60">
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(note.id); }}
                        >
                          <PinIcon className={`h-3.5 w-3.5 ${note.pinned ? "fill-primary text-primary" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                        >
                          <TrashIcon className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showEditor} onOpenChange={(v) => { if (!v) closeEditor(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNote ? "Edit Note" : "New Note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <TextField
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Start writing..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring min-h-[200px] resize-y"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={!editTitle.trim() || saving}
            >
              {saving ? <Spinner size={16} className="mr-2" /> : null}
              {editingNote ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <TextField
              label="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Color</p>
              <div className="flex gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewFolderColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      newFolderColor === c ? "scale-125 ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creatingFolder}
            >
              {creatingFolder ? <Spinner size={16} className="mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
}
