"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { extractSyllabusFromText, extractSyllabusFromImage } from "@/server/lib/syllabus-extract";

export type SyllabusRequirementType =
  | "assignment" | "activity" | "quiz" | "exam" | "project"
  | "presentation" | "laboratory" | "report" | "research"
  | "recitation" | "practical" | "submission" | "other";

const VALID_TYPES: SyllabusRequirementType[] = [
  "assignment", "activity", "quiz", "exam", "project",
  "presentation", "laboratory", "report", "research",
  "recitation", "practical", "submission", "other",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidType(t: string): t is SyllabusRequirementType {
  return (VALID_TYPES as string[]).includes(t);
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

export type ExtractFromPdfResult =
  | { success: true; data: { course: Record<string, unknown>; requirements: Record<string, unknown>[] } }
  | { success: false; error: string };

export async function extractSyllabusFromPdf(
  textContent: string,
): Promise<ExtractFromPdfResult> {
  try {
    await requireSession();
    const result = await extractSyllabusFromText(textContent);
    return { success: true, data: result as { course: Record<string, unknown>; requirements: Record<string, unknown>[] } };
  } catch (err) {
    console.error("[SYLLABUS_EXTRACT]", err);
    return { success: false, error: err instanceof Error ? err.message : "Extraction failed" };
  }
}

export type ExtractFromImageResult =
  | { success: true; data: { course: Record<string, unknown>; requirements: Record<string, unknown>[] } }
  | { success: false; error: string };

export async function extractSyllabusFromImageAction(
  base64Data: string,
  mimeType: string,
): Promise<ExtractFromImageResult> {
  try {
    await requireSession();
    const result = await extractSyllabusFromImage(base64Data, mimeType);
    return { success: true, data: result as { course: Record<string, unknown>; requirements: Record<string, unknown>[] } };
  } catch (err) {
    console.error("[SYLLABUS_EXTRACT_IMG]", err);
    return { success: false, error: err instanceof Error ? err.message : "Extraction failed" };
  }
}

export type SaveSyllabusInput = {
  courseName: string;
  courseCode?: string;
  section?: string;
  instructor?: string;
  semester?: string;
  schoolYear?: string;
  department?: string;
  units?: string;
  description?: string;
  fileId?: string;
  fileName?: string;
  requirements: Array<{
    title: string;
    type: string;
    description?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    week?: number;
    datePrecision: string;
    sourceText?: string;
    addToDo: boolean;
    addReminder: boolean;
    reminderMinutes?: number;
  }>;
};

export type SaveSyllabusResult =
  | { success: true; syllabusId: string; todosCreated: number; calendarEvents: number }
  | { success: false; error: string };

export async function saveSyllabus(input: SaveSyllabusInput): Promise<SaveSyllabusResult> {
  try {
    const session = await requireSession();

    if (!input.courseName?.trim()) {
      return { success: false, error: "Course name is required" };
    }

    const syllabus = await db.syllabus.create({
      data: {
        userId: session.user.id,
        courseName: input.courseName.trim(),
        courseCode: input.courseCode?.trim() || null,
        section: input.section?.trim() || null,
        instructor: input.instructor?.trim() || null,
        semester: input.semester?.trim() || null,
        schoolYear: input.schoolYear?.trim() || null,
        department: input.department?.trim() || null,
        units: input.units?.trim() || null,
        description: input.description?.trim() || null,
        fileId: input.fileId || null,
        fileName: input.fileName || null,
      },
    });

    let todosCreated = 0;
    let calendarEvents = 0;

    for (const req of input.requirements) {
      const type = isValidType(req.type) ? req.type : "other";
      const datePrecision = ["exact", "range", "week", "unspecified"].includes(req.datePrecision)
        ? req.datePrecision : "unspecified";

      const savedReq = await db.syllabusRequirement.create({
        data: {
          syllabusId: syllabus.id,
          title: req.title.trim() || "Untitled",
          description: req.description?.trim() || null,
          type,
          date: req.date || null,
          startDate: req.startDate || null,
          endDate: req.endDate || null,
          week: req.week ?? null,
          datePrecision,
          sourceText: req.sourceText || null,
          addToDo: req.addToDo,
          addReminder: req.addReminder,
          reminderMinutes: req.reminderMinutes ?? 1440,
        },
      });

      // Create todo if requested
      if (req.addToDo && req.title.trim()) {
        const todoText = `[${input.courseCode || input.courseName}] ${req.title}`;
        const todo = await db.todo.create({
          data: {
            userId: session.user.id,
            text: todoText.length > 500 ? todoText.slice(0, 497) + "..." : todoText,
            priority: req.type === "exam" || req.type === "project" ? "high" : "medium",
            category: "school",
            dueDate: DATE_RE.test(req.date || "") ? req.date! : null,
            syllabusId: syllabus.id,
            syllabusRequirementId: savedReq.id,
          },
        });
        await db.syllabusRequirement.update({
          where: { id: savedReq.id },
          data: { todoId: todo.id },
        });
        todosCreated++;

        // Create planner entry for dated requirements
        if (DATE_RE.test(req.date || "")) {
          const plannerEntry = await db.plannerEntry.create({
            data: {
              userId: session.user.id,
              title: `${input.courseCode || input.courseName} - ${req.title}`,
              date: req.date!,
              type: "task",
              color: "#ef4444",
              todoId: todo.id,
              syllabusRequirementId: savedReq.id,
            },
          });
          await db.syllabusRequirement.update({
            where: { id: savedReq.id },
            data: { plannerEntryId: plannerEntry.id },
          });
          calendarEvents++;
        }
      }
    }

    return { success: true, syllabusId: syllabus.id, todosCreated, calendarEvents };
  } catch (err) {
    console.error("[SAVE_SYLLABUS]", err);
    return { success: false, error: "Failed to save syllabus" };
  }
}

export type SyllabusWithRequirements = {
  id: string;
  courseName: string;
  courseCode: string | null;
  section: string | null;
  instructor: string | null;
  semester: string | null;
  schoolYear: string | null;
  department: string | null;
  units: string | null;
  description: string | null;
  fileId: string | null;
  fileName: string | null;
  extractedAt: Date;
  createdAt: Date;
  requirements: Array<{
    id: string;
    title: string;
    description: string | null;
    type: string;
    date: string | null;
    startDate: string | null;
    endDate: string | null;
    week: number | null;
    datePrecision: string;
    sourceText: string | null;
    status: string;
    addToDo: boolean;
    addReminder: boolean;
    reminderMinutes: number;
    todoId: string | null;
  }>;
};

export async function getSyllabi(): Promise<SyllabusWithRequirements[]> {
  const session = await requireSession();
  return db.syllabus.findMany({
    where: { userId: session.user.id },
    include: { requirements: { orderBy: { date: "asc" } } },
    orderBy: { createdAt: "desc" },
  }) as Promise<SyllabusWithRequirements[]>;
}

export async function getSyllabus(id: string): Promise<SyllabusWithRequirements | null> {
  const session = await requireSession();
  return db.syllabus.findFirst({
    where: { id, userId: session.user.id },
    include: { requirements: { orderBy: { date: "asc" } } },
  }) as Promise<SyllabusWithRequirements | null>;
}

export async function deleteSyllabus(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const syllabus = await db.syllabus.findFirst({
      where: { id, userId: session.user.id },
      include: { requirements: true },
    });
    if (!syllabus) return { success: false, error: "Syllabus not found" };

    // Delete linked todos (but not manually created ones)
    const todoIds = syllabus.requirements
      .filter((r: { todoId: string | null }) => r.todoId)
      .map((r: { todoId: string | null }) => r.todoId!);
    if (todoIds.length > 0) {
      await db.plannerEntry.deleteMany({ where: { todoId: { in: todoIds } } });
      await db.todo.deleteMany({ where: { id: { in: todoIds } } });
    }

    await db.syllabus.delete({ where: { id } });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_SYLLABUS]", err);
    return { success: false, error: "Failed to delete syllabus" };
  }
}

export async function updateSyllabusRequirement(
  requirementId: string,
  data: Partial<{
    title: string;
    description: string;
    type: string;
    date: string;
    startDate: string;
    endDate: string;
    week: number;
    datePrecision: string;
    addToDo: boolean;
    addReminder: boolean;
    reminderMinutes: number;
    status: string;
  }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const req = await db.syllabusRequirement.findFirst({
      where: { id: requirementId, syllabus: { userId: session.user.id } },
    });
    if (!req) return { success: false, error: "Requirement not found" };

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.type !== undefined && isValidType(data.type)) updateData.type = data.type;
    if (data.date !== undefined) updateData.date = data.date || null;
    if (data.startDate !== undefined) updateData.startDate = data.startDate || null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate || null;
    if (data.week !== undefined) updateData.week = data.week ?? null;
    if (data.datePrecision !== undefined) updateData.datePrecision = data.datePrecision;
    if (data.addToDo !== undefined) updateData.addToDo = data.addToDo;
    if (data.addReminder !== undefined) updateData.addReminder = data.addReminder;
    if (data.reminderMinutes !== undefined) updateData.reminderMinutes = data.reminderMinutes;
    if (data.status !== undefined) updateData.status = data.status;

    await db.syllabusRequirement.update({
      where: { id: requirementId },
      data: updateData,
    });

    // Sync linked todo
    if (req.todoId) {
      const todoUpdate: Record<string, unknown> = {};
      if (data.title !== undefined) {
        const syllabus = await db.syllabus.findUnique({ where: { id: req.syllabusId } });
        todoUpdate.text = `[${syllabus?.courseCode || syllabus?.courseName || ""}] ${data.title}`.slice(0, 500);
      }
      if (data.date !== undefined) {
        todoUpdate.dueDate = DATE_RE.test(data.date || "") ? data.date : null;
      }
      if (data.status !== undefined) {
        todoUpdate.completed = data.status === "completed";
        todoUpdate.completedAt = data.status === "completed" ? new Date() : null;
      }
      if (Object.keys(todoUpdate).length > 0) {
        await db.todo.update({ where: { id: req.todoId }, data: todoUpdate });
      }
    }

    // Sync linked planner entry
    if (req.plannerEntryId) {
      const plannerUpdate: Record<string, unknown> = {};
      if (data.title !== undefined) {
        const syllabus = await db.syllabus.findUnique({ where: { id: req.syllabusId } });
        plannerUpdate.title = `${syllabus?.courseCode || syllabus?.courseName} - ${data.title}`;
      }
      if (data.date !== undefined) {
        plannerUpdate.date = DATE_RE.test(data.date || "") ? data.date : null;
      }
      if (data.status !== undefined) {
        plannerUpdate.completed = data.status === "completed";
      }
      if (Object.keys(plannerUpdate).length > 0) {
        await db.plannerEntry.update({ where: { id: req.plannerEntryId }, data: plannerUpdate });
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[UPDATE_SYLLABUS_REQ]", err);
    return { success: false, error: "Failed to update requirement" };
  }
}

export async function deleteSyllabusRequirement(
  requirementId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    const req = await db.syllabusRequirement.findFirst({
      where: { id: requirementId, syllabus: { userId: session.user.id } },
    });
    if (!req) return { success: false, error: "Requirement not found" };

    // Delete linked todo and planner entries
    if (req.todoId) {
      await db.plannerEntry.deleteMany({ where: { todoId: req.todoId } });
      await db.todo.delete({ where: { id: req.todoId } });
    }
    if (req.plannerEntryId) {
      await db.plannerEntry.delete({ where: { id: req.plannerEntryId } });
    }

    await db.syllabusRequirement.delete({ where: { id: requirementId } });
    return { success: true };
  } catch (err) {
    console.error("[DELETE_SYLLABUS_REQ]", err);
    return { success: false, error: "Failed to delete requirement" };
  }
}

export async function addSyllabusRequirement(
  syllabusId: string,
  data: {
    title: string;
    type?: string;
    description?: string;
    date?: string;
    datePrecision?: string;
    addToDo?: boolean;
  },
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const session = await requireSession();
    const syllabus = await db.syllabus.findFirst({
      where: { id: syllabusId, userId: session.user.id },
    });
    if (!syllabus) return { success: false, error: "Syllabus not found" };

    const type = data.type && isValidType(data.type) ? data.type : "other";
    const req = await db.syllabusRequirement.create({
      data: {
        syllabusId,
        title: data.title.trim() || "Untitled",
        description: data.description?.trim() || null,
        type,
        date: data.date || null,
        datePrecision: data.datePrecision || "unspecified",
        addToDo: data.addToDo ?? true,
      },
    });

    // Create todo if requested
    if (data.addToDo ?? true) {
      const todoText = `[${syllabus.courseCode || syllabus.courseName}] ${req.title}`;
      const todo = await db.todo.create({
        data: {
          userId: session.user.id,
          text: todoText.length > 500 ? todoText.slice(0, 497) + "..." : todoText,
          priority: req.type === "exam" || req.type === "project" ? "high" : "medium",
          category: "school",
          dueDate: DATE_RE.test(req.date || "") ? req.date! : null,
          syllabusId: syllabus.id,
          syllabusRequirementId: req.id,
        },
      });
      await db.syllabusRequirement.update({
        where: { id: req.id },
        data: { todoId: todo.id },
      });

      // Create planner entry for dated requirements
      if (DATE_RE.test(req.date || "")) {
        const plannerEntry = await db.plannerEntry.create({
          data: {
            userId: session.user.id,
            title: `${syllabus.courseCode || syllabus.courseName} - ${req.title}`,
            date: req.date!,
            type: "task",
            color: "#ef4444",
            todoId: todo.id,
            syllabusRequirementId: req.id,
          },
        });
        await db.syllabusRequirement.update({
          where: { id: req.id },
          data: { plannerEntryId: plannerEntry.id },
        });
      }
    }

    return { success: true, id: req.id };
  } catch (err) {
    console.error("[ADD_SYLLABUS_REQ]", err);
    return { success: false, error: "Failed to add requirement" };
  }
}

export async function getSyllabusWithConnections(syllabusId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const syllabus = await db.syllabus.findFirst({
    where: { id: syllabusId, userId: session.user.id },
    include: {
      requirements: {
        include: {
          todo: true,
          plannerEntry: true,
        },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!syllabus) return null;

  // Get linked flashcard decks
  const flashcardDecks = await db.flashcardDeck.findMany({
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

  return { syllabus, flashcardDecks };
}
