import type { Job } from "bullmq";

export interface SyllabusJobData {
  syllabusId: string;
  userId: string;
  content: string;
  fileName?: string;
}

export interface SyllabusJobResult {
  syllabusId: string;
  status: "completed" | "failed";
  topicsCount?: number;
  error?: string;
}

export async function processSyllabusData(
  data: SyllabusJobData,
  jobId?: string
): Promise<SyllabusJobResult> {
  const { syllabusId, userId, content } = data;

  console.log(`[SYLLABUS_WORKER] Processing job ${jobId || syllabusId} for syllabus ${syllabusId}`);

  try {
    return { syllabusId, status: "completed", topicsCount: 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[SYLLABUS_WORKER] Job ${jobId} failed:`, errorMessage);
    return { syllabusId, status: "failed", error: errorMessage };
  }
}

export async function processSyllabusJob(
  job: Job<SyllabusJobData>
): Promise<SyllabusJobResult> {
  return processSyllabusData(job.data, job.id);
}
