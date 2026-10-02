"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";

export async function getNoteFolders() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.noteFolder.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { notes: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getNotes(folderId?: string | null) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.note.findMany({
    where: {
      userId: session.user.id,
      folderId: folderId || null,
    },
    select: {
      id: true,
      title: true,
      content: true,
      pinned: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getAllNotes() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.note.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      title: true,
      content: true,
      pinned: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createFolder(name: string, color: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = name.trim();
  if (!clean) return { success: false, error: "Name is required" };

  try {
    const folder = await db.noteFolder.create({
      data: { userId: session.user.id, name: clean, color },
    });
    return { success: true, folderId: folder.id };
  } catch (err) {
    console.error("[CREATE_FOLDER]", err);
    return { success: false, error: "Failed to create folder" };
  }
}

export async function deleteFolder(folderId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.note.updateMany({
      where: { folderId, userId: session.user.id },
      data: { folderId: null },
    });
    await db.noteFolder.deleteMany({
      where: { id: folderId, userId: session.user.id },
    });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_FOLDER]", err);
    return { success: false };
  }
}

export async function createNote(
  title: string,
  content: string,
  folderId?: string | null
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const cleanTitle = title.trim();
  if (!cleanTitle) return { success: false, error: "Title is required" };

  try {
    const note = await db.note.create({
      data: {
        userId: session.user.id,
        title: cleanTitle,
        content,
        folderId: folderId || null,
      },
    });
    return { success: true, noteId: note.id };
  } catch (err) {
    console.error("[CREATE_NOTE]", err);
    return { success: false, error: "Failed to create note" };
  }
}

export async function updateNote(
  noteId: string,
  title: string,
  content: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const existing = await db.note.findFirst({
      where: { id: noteId, userId: session.user.id },
    });
    if (!existing) return { success: false, error: "Note not found" };

    await db.note.update({
      where: { id: noteId },
      data: {
        title: title.trim() || existing.title,
        content,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[UPDATE_NOTE]", err);
    return { success: false, error: "Failed to update note" };
  }
}

export async function togglePin(noteId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const note = await db.note.findFirst({
      where: { id: noteId, userId: session.user.id },
    });
    if (!note) return { success: false };

    await db.note.update({
      where: { id: noteId },
      data: { pinned: !note.pinned },
    });
    return { success: true };
  } catch (err) {
    console.error("[TOGGLE_PIN]", err);
    return { success: false };
  }
}

export async function moveNoteToFolder(noteId: string, folderId: string | null) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.note.updateMany({
      where: { id: noteId, userId: session.user.id },
      data: { folderId: folderId || null },
    });
    return { success: true };
  } catch (err) {
    console.error("[MOVE_NOTE]", err);
    return { success: false };
  }
}

export async function deleteNote(noteId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.note.deleteMany({
      where: { id: noteId, userId: session.user.id },
    });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_NOTE]", err);
    return { success: false };
  }
}
