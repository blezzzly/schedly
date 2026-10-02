"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { scheduleService } from "@/server/services/schedule.service";

export type PlannerEntryType = "task" | "event" | "study" | "personal";
const VALID_TYPES: PlannerEntryType[] = ["task", "event", "study", "personal"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidType(t: string): t is PlannerEntryType {
  return (VALID_TYPES as string[]).includes(t);
}

function getWeekDates(baseDate: string): string[] {
  const d = new Date(baseDate + "T00:00:00+08:00");
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd.toISOString().slice(0, 10);
  });
}

export async function getPlannerWeek(weekStart: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  const dates = getWeekDates(weekStart);
  return db.plannerEntry.findMany({
    where: {
      userId: session.user.id,
      date: { in: dates },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function createPlannerEntry(
  title: string,
  date: string,
  startTime: string,
  endTime: string,
  type: string,
  color: string,
  todoId?: string,
  syllabusRequirementId?: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const clean = title.trim();
  if (!clean) return { success: false, error: "Title is required" };
  if (!DATE_RE.test(date)) return { success: false, error: "Invalid date" };
  if (!isValidType(type)) return { success: false, error: "Invalid type" };

  try {
    await db.plannerEntry.create({
      data: {
        userId: session.user.id,
        title: clean,
        date,
        startTime: startTime || null,
        endTime: endTime || null,
        type,
        color,
        todoId: todoId || null,
        syllabusRequirementId: syllabusRequirementId || null,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[CREATE_PLANNER]", err);
    const message = err instanceof Error ? err.message : "Failed to create entry";
    return { success: false, error: message };
  }
}

export async function updatePlannerEntry(
  entryId: string,
  title: string,
  startTime: string,
  endTime: string,
  type: string,
  color: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const existing = await db.plannerEntry.findFirst({
      where: { id: entryId, userId: session.user.id },
    });
    if (!existing) return { success: false, error: "Entry not found" };

    await db.plannerEntry.update({
      where: { id: entryId },
      data: {
        title: title.trim() || existing.title,
        startTime: startTime || null,
        endTime: endTime || null,
        type: isValidType(type) ? type : existing.type,
        color,
      },
    });
    return { success: true };
  } catch (err) {
    console.error("[UPDATE_PLANNER]", err);
    return { success: false, error: "Failed to update entry" };
  }
}

export async function togglePlannerEntry(entryId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    const entry = await db.plannerEntry.findFirst({
      where: { id: entryId, userId: session.user.id },
    });
    if (!entry) return { success: false };

    const newCompleted = !entry.completed;
    await db.plannerEntry.update({
      where: { id: entryId },
      data: { completed: newCompleted },
    });

    // Sync back to syllabus requirement if linked
    if (entry.syllabusRequirementId) {
      await db.syllabusRequirement.update({
        where: { id: entry.syllabusRequirementId },
        data: { status: newCompleted ? "completed" : "pending" },
      });
    }
    // Sync back to todo if linked
    if (entry.todoId) {
      await db.todo.update({
        where: { id: entry.todoId },
        data: { completed: newCompleted, completedAt: newCompleted ? new Date() : null },
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[TOGGLE_PLANNER]", err);
    return { success: false };
  }
}

export async function deletePlannerEntry(entryId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false };

  try {
    await db.plannerEntry.deleteMany({
      where: { id: entryId, userId: session.user.id },
    });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_PLANNER]", err);
    return { success: false };
  }
}

export async function getPlannerEntriesByRequirement(requirementId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.plannerEntry.findMany({
    where: { userId: session.user.id, syllabusRequirementId: requirementId },
    orderBy: { date: "asc" },
  });
}

export async function getPlannerEntriesByTodo(todoId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  return db.plannerEntry.findMany({
    where: { userId: session.user.id, todoId },
    orderBy: { date: "asc" },
  });
}

export type PlannerClass = {
  id: string;
  subject: string;
  shortName: string | null;
  code: string | null;
  room: string | null;
  instructor: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: string[];
};

/** The student's fixed weekly classes from their active class schedule,
 *  shown as read-only context inside the Planner. */
export async function getPlannerClasses(): Promise<PlannerClass[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];

  const active = await scheduleService.getActiveByUser(session.user.id);
  if (!active) return [];

  return (active.classes as Array<{
    id: string;
    subject: string;
    shortName: string | null;
    code: string | null;
    room: string | null;
    instructor: string | null;
    color: string;
    startTime: Date;
    endTime: Date;
    days: string[];
  }>).map((c) => ({
    id: c.id,
    subject: c.subject,
    shortName: c.shortName,
    code: c.code,
    room: c.room,
    instructor: c.instructor,
    color: c.color,
    startTime: c.startTime,
    endTime: c.endTime,
    days: (c.days as string[]) ?? [],
  }));
}
