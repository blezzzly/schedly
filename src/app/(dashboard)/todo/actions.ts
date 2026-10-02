"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/lib/audit";

export type TodoPriority = "low" | "medium" | "high";
export type TodoCategory = "general" | "school" | "personal" | "work";

const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
const CATEGORIES: TodoCategory[] = ["general", "school", "personal", "work"];
const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPriority(value: string): value is TodoPriority {
  return (PRIORITIES as string[]).includes(value);
}

function isCategory(value: string): value is TodoCategory {
  return (CATEGORIES as string[]).includes(value);
}

export async function getTodos() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.todo.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export type AddTodoResult = { success: true } | { success: false; error: string };

export async function addTodoAction(
  text: string,
  priority: string,
  dueDate?: string,
  category?: string,
  syllabusId?: string,
  syllabusRequirementId?: string
): Promise<AddTodoResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = text.trim();
  if (!clean) return { success: false, error: "Task text is required" };
  if (clean.length > 500) return { success: false, error: "Task is too long (max 500 characters)" };
  if (!isPriority(priority)) return { success: false, error: "Invalid priority" };
  if (dueDate && !DUE_DATE_RE.test(dueDate)) return { success: false, error: "Invalid due date" };
  const cat = category && isCategory(category) ? category : "general";

  try {
    await db.todo.create({
      data: {
        userId: session.user.id,
        text: clean,
        priority,
        dueDate: dueDate || undefined,
        category: cat,
        syllabusId: syllabusId || undefined,
        syllabusRequirementId: syllabusRequirementId || undefined,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[ADD_TODO]", err);
    return { success: false, error: "Failed to add task" };
  }
}

export async function toggleTodoAction(todoId: string): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const todo = await db.todo.findFirst({ where: { id: todoId, userId: session.user.id } });
    if (!todo) return { success: false };
    const newCompleted = !todo.completed;
    await db.todo.update({
      where: { id: todoId },
      data: { completed: newCompleted, completedAt: newCompleted ? new Date() : null },
    });

    // Sync back to syllabus requirement if linked
    if (todo.syllabusRequirementId) {
      await db.syllabusRequirement.update({
        where: { id: todo.syllabusRequirementId },
        data: { status: newCompleted ? "completed" : "pending" },
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[TOGGLE_TODO]", err);
    return { success: false };
  }
}

export type EditTodoResult = { success: true } | { success: false; error: string };

export async function editTodoAction(
  todoId: string,
  text: string,
  priority: string,
  dueDate?: string,
  category?: string
): Promise<EditTodoResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = text.trim();
  if (!clean) return { success: false, error: "Task text is required" };
  if (clean.length > 500) return { success: false, error: "Task is too long (max 500 characters)" };
  if (!isPriority(priority)) return { success: false, error: "Invalid priority" };
  if (dueDate && !DUE_DATE_RE.test(dueDate)) return { success: false, error: "Invalid due date" };
  const cat = category && isCategory(category) ? category : undefined;

  try {
    const existing = await db.todo.findFirst({ where: { id: todoId, userId: session.user.id } });
    if (!existing) return { success: false, error: "Task not found" };
    await db.todo.update({
      where: { id: todoId },
      data: { text: clean, priority, dueDate: dueDate || null, ...(cat ? { category: cat } : {}) },
    });

    // Sync back to syllabus requirement if linked
    if (existing.syllabusRequirementId) {
      const updateData: Record<string, unknown> = {};
      if (dueDate !== undefined) {
        updateData.dueDate = DUE_DATE_RE.test(dueDate || "") ? dueDate : null;
      }
      if (Object.keys(updateData).length > 0) {
        await db.syllabusRequirement.update({
          where: { id: existing.syllabusRequirementId },
          data: updateData,
        });
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[EDIT_TODO]", err);
    return { success: false, error: "Failed to update task" };
  }
}

export async function deleteTodoAction(todoId: string): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.todo.deleteMany({ where: { id: todoId, userId: session.user.id } });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_TODO]", err);
    return { success: false };
  }
}

export async function clearCompletedAction(): Promise<{ success: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const result = await db.todo.deleteMany({
      where: { userId: session.user.id, completed: true },
    });
    if (result.count > 0) {
      auditLog("todo.clear_completed", { userId: session.user.id, count: result.count });
    }
    return { success: true };
  } catch (err) {
    console.error("[CLEAR_TODOS]", err);
    return { success: false };
  }
}

export async function getTodosBySyllabus(syllabusId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.todo.findMany({
    where: { userId: session.user.id, syllabusId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTodosByRequirement(requirementId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.todo.findMany({
    where: { userId: session.user.id, syllabusRequirementId: requirementId },
    orderBy: { createdAt: "desc" },
  });
}
