import type { Job } from "bullmq";

export interface ScheduleJobData {
  scheduleId: string;
  userId: string;
  type: "optimize" | "conflict_check";
}

export interface ScheduleJobResult {
  scheduleId: string;
  status: "completed" | "failed";
  error?: string;
}

export async function processScheduleData(
  data: ScheduleJobData,
  jobId?: string
): Promise<ScheduleJobResult> {
  const { scheduleId } = data;

  console.log(`[SCHEDULE_WORKER] Processing job ${jobId || scheduleId} for schedule ${scheduleId}`);

  try {
    return { scheduleId, status: "completed" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[SCHEDULE_WORKER] Job ${jobId} failed:`, errorMessage);
    return { scheduleId, status: "failed", error: errorMessage };
  }
}

export async function processScheduleJob(
  job: Job<ScheduleJobData>
): Promise<ScheduleJobResult> {
  return processScheduleData(job.data, job.id);
}

export const scheduleWorkerConcurrency = 3;
export const scheduleWorkerLimiter = { max: 10, duration: 1000 };