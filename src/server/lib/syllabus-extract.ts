/**
 * Syllabus extraction entry point. Uses the centralized AI gateway
 * (src/server/ai/ai.service.ts) so all retries, key rotation, and provider
 * fallback are handled centrally. The prompt and normalization logic remain here
 * so that document-specific concerns stay decoupled from the AI layer.
 */
import { generateWithFallback } from "@/server/ai/ai.service";
import { PipelineLogger } from "@/server/lib/structured-logger";

export type SyllabusCourse = {
  name: string | null;
  code: string | null;
  section: string | null;
  instructor: string | null;
  email: string | null;
  department: string | null;
  semester: string | null;
  school_year: string | null;
  units: string | null;
};

export type SyllabusRequirementRaw = {
  title: string;
  type: string;
  description: string | null;
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  week: number | null;
  date_precision: string;
  source_text: string | null;
};

export type SyllabusExtractionResult = {
  course: SyllabusCourse;
  requirements: SyllabusRequirementRaw[];
};

const SYLLABUS_PROMPT = `You are an academic syllabus extraction engine.

Extract only information explicitly present in the provided syllabus.

Return valid JSON matching the required schema.

Do not invent: dates, assignments, instructors, course information, grades, or requirements.

If information is missing, return null. Preserve uncertainty.

Distinguish: exact dates (e.g. "September 15, 2026"), date ranges (e.g. "September 10-15"), week-based dates (e.g. "Week 5"), and unspecified dates.

Extract academic requirements including assignments, activities, quizzes, exams, projects, presentations, laboratory work, reports, research, practical exams, submissions, and other meaningful academic requirements.

Do not turn general weekly topics into assignments unless the syllabus explicitly identifies them as academic requirements.

Deduplicate identical requirements.

Return ONLY valid JSON:
{"course": {"name": null, "code": null, "section": null, "instructor": null, "email": null, "department": null, "semester": null, "school_year": null, "units": null}, "requirements": [{"title": "", "type": "assignment", "description": null, "date": null, "start_date": null, "end_date": null, "week": null, "date_precision": "unspecified", "source_text": null}]}`;

const VALID_REQUIREMENT_TYPES = new Set([
  "assignment", "activity", "quiz", "exam", "project",
  "presentation", "laboratory", "report", "research",
  "recitation", "practical", "submission", "other",
]);

const VALID_DATE_PRECISIONS = new Set(["exact", "range", "week", "unspecified"]);

function normalizeRequirementType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return VALID_REQUIREMENT_TYPES.has(lower) ? lower : "other";
}

function normalizeDatePrecision(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return VALID_DATE_PRECISIONS.has(lower) ? lower : "unspecified";
}

function normalizeResult(raw: Record<string, unknown>): SyllabusExtractionResult {
  const course = (raw.course ?? {}) as Record<string, unknown>;
  const requirements = Array.isArray(raw.requirements) ? raw.requirements : [];

  const normalizedCourse: SyllabusCourse = {
    name: typeof course.name === "string" ? course.name : null,
    code: typeof course.code === "string" ? course.code : null,
    section: typeof course.section === "string" ? course.section : null,
    instructor: typeof course.instructor === "string" ? course.instructor : null,
    email: typeof course.email === "string" ? course.email : null,
    department: typeof course.department === "string" ? course.department : null,
    semester: typeof course.semester === "string" ? course.semester : null,
    school_year: typeof course.school_year === "string" ? course.school_year : null,
    units: typeof course.units === "string" ? course.units : null,
  };

  const normalizedRequirements: SyllabusRequirementRaw[] = requirements
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      title: typeof r.title === "string" ? r.title.trim() : "Untitled",
      type: normalizeRequirementType(typeof r.type === "string" ? r.type : "other"),
      description: typeof r.description === "string" ? r.description : null,
      date: typeof r.date === "string" ? r.date : null,
      start_date: typeof r.start_date === "string" ? r.start_date : null,
      end_date: typeof r.end_date === "string" ? r.end_date : null,
      week: typeof r.week === "number" ? r.week : null,
      date_precision: normalizeDatePrecision(typeof r.date_precision === "string" ? r.date_precision : "unspecified"),
      source_text: typeof r.source_text === "string" ? r.source_text : null,
    }));

  return { course: normalizedCourse, requirements: normalizedRequirements };
}

function dedupRequirements(result: SyllabusExtractionResult): SyllabusExtractionResult {
  const seen = new Set<string>();
  return {
    ...result,
    requirements: result.requirements.filter((r) => {
      const key = `${r.title.toLowerCase()}|${r.date ?? ""}|${r.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

export async function extractSyllabusFromText(
  textContent: string,
): Promise<SyllabusExtractionResult> {
  if (!textContent || textContent.trim().length < 20) {
    throw new Error("Document contains no readable syllabus content");
  }

  const truncated = textContent.slice(0, 15_000);

  const result = await generateWithFallback(
    "SYLLABUS_GENERATION",
    { text: truncated },
    { temperature: 0.1, maxTokens: 8192, prompt: SYLLABUS_PROMPT },
  );

  if (!result.success || !result.data) {
    PipelineLogger.warn("syllabus", "AI gateway returned no result", { provider: result.provider });
    throw new Error("Extraction failed. Please try again later.");
  }

  return dedupRequirements(normalizeResult(result.data));
}

export async function extractSyllabusFromImage(
  base64Data: string,
  mimeType: string,
): Promise<SyllabusExtractionResult> {
  const result = await generateWithFallback(
    "SYLLABUS_GENERATION",
    { image: { base64: base64Data, mimeType } },
    { temperature: 0.1, maxTokens: 8192, prompt: SYLLABUS_PROMPT },
  );

  if (!result.success || !result.data) {
    throw new Error("Extraction failed. Please try again later.");
  }

  return dedupRequirements(normalizeResult(result.data));
}
