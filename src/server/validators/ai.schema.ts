import { z } from "zod";

const daysOfWeek = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

/* ===== AI Output Schema (per Architecture Doc) ===== */
const aiDayEnum = z
  .string()
  .min(1)
  .transform((d) => d.trim());

const confidenceField = z
  .union([z.number(), z.string()])
  .transform((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (Number.isNaN(n)) return 0.5;
    // Accept percentages (0-100) and normalize to 0-1
    return n > 1 ? Math.min(n / 100, 1) : Math.max(0, Math.min(n, 1));
  })
  .optional();

export const aiClassSchema = z.object({
  subject: z.string().min(1),
  subject_confidence: confidenceField,
  courseCode: z.string().nullable().default(null),
  courseCode_confidence: confidenceField,
  days: z.array(aiDayEnum).min(1),
  days_confidence: confidenceField,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  startTime_confidence: confidenceField,
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime_confidence: confidenceField,
  room: z.string().nullable().default(null),
  room_confidence: confidenceField,
  instructor: z.string().nullable().default(null),
  instructor_confidence: confidenceField,
  section: z.string().nullable().default(null),
  block: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const aiValidationResultSchema = z.object({
  validated: z.boolean().optional().default(true),
  semester: z.string().nullable().default(null),
  classes: z.array(aiClassSchema),
  issues: z
    .array(
      z.object({
        type: z.string().optional().default("unknown"),
        message: z.string().optional().default(""),
        classIndex: z.number().optional(),
      })
    )
    .optional()
    .default([]),
  overallConfidence: confidenceField.default(0.5),
});

export type AiClass = z.infer<typeof aiClassSchema>;
export type AiValidationResult = z.infer<typeof aiValidationResultSchema>;

/* ===== Internal Extraction Schema (app data model) ===== */
export const extractedClassSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  code: z.string().nullable().default(null),
  instructor: z.string().nullable().default(null),
  room: z.string().nullable().default(null),
  section: z.string().nullable().default(null),
  block: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  days: z
    .array(z.enum(daysOfWeek))
    .min(1, "At least one day is required"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
});

export const conflictSchema = z.object({
  classA: z.number(),
  classB: z.number(),
  day: z.string(),
  message: z.string(),
});

export const consistencyIssueSchema = z.object({
  type: z.string(),
  classIndex: z.number(),
  field: z.string(),
  message: z.string(),
});

export const extractionResultSchema = z.object({
  semester: z.string().nullable().default(null),
  classes: z.array(extractedClassSchema),
  metadata: z.object({
    totalClasses: z.number(),
    confidence: z.number().min(0).max(1),
    notes: z.string().nullable().default(null),
    error: z.string().optional(),
    issues: z.array(z.object({
      type: z.string(),
      message: z.string(),
      classIndex: z.number().optional(),
    })).optional(),
    consistencyScore: z.number().min(0).max(1).optional(),
    hasConflicts: z.boolean().optional(),
    conflicts: z.array(conflictSchema).optional(),
    consistencyIssues: z.array(consistencyIssueSchema).optional(),
  }),
});

export type ExtractedClass = z.infer<typeof extractedClassSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/* ===== Save Schedule Schema (unchanged, uses internal format) ===== */
export const saveScheduleSchema = z.object({
  title: z.string().min(1, "Schedule title is required"),
  semester: z.string().nullable().default(null),
  academicYear: z.string().nullable().default(null),
  classes: z.array(
    z.object({
      subject: z.string().min(1),
      shortName: z.string().nullable().default(null),
      code: z.string().nullable().default(null),
      instructor: z.string().nullable().default(null),
      room: z.string().nullable().default(null),
      section: z.string().nullable().default(null),
      block: z.string().nullable().default(null),
      notes: z.string().nullable().default(null),
      days: z.array(z.enum(daysOfWeek)).min(1),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ).min(1, "At least one class is required"),
  uploadId: z.string().optional(),
});

export type SaveScheduleInput = z.infer<typeof saveScheduleSchema>;

/* ===== Transform AI output → Internal format ===== */
import { normalizeDays } from "@/server/lib/day-normalizer";

export function transformAiOutputToInternal(aiOutput: AiValidationResult): ExtractionResult {
  const issues = aiOutput.issues || [];

  const classes = aiOutput.classes.map((aiClass) => {
    // Deterministically normalize day tokens — never trust the model's own
    // expansion. This is what prevents "TF" from becoming Tue/Thu.
    const norm = normalizeDays(aiClass.days);

    return {
      subject: aiClass.subject,
      code: aiClass.courseCode,
      instructor: aiClass.instructor,
      room: aiClass.room,
      section: aiClass.section,
      block: aiClass.block,
      days: norm.days,
      startTime: aiClass.startTime,
      endTime: aiClass.endTime,
      confidence: aiClass.startTime_confidence ?? aiOutput.overallConfidence ?? 1,
      notes: aiClass.notes,
    };
  });

  return {
    semester: aiOutput.semester,
    classes,
    metadata: {
      totalClasses: classes.length,
      confidence: aiOutput.overallConfidence,
      notes: null,
      issues,
    },
  };
}
