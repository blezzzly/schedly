import { Worker, Job } from "bullmq";
import { connectionConfig } from "../lib/queues";
import { processFlashcardData, type FlashcardJobData, type FlashcardJobResult } from "./flashcard-worker";
import { processSyllabusData, type SyllabusJobData, type SyllabusJobResult } from "./syllabus-worker";
import { processScheduleData, type ScheduleJobData, type ScheduleJobResult } from "./schedule-worker";
import { flashcardQueue as memFlashcardQueue, syllabusQueue as memSyllabusQueue, scheduleQueue as memScheduleQueue } from "../lib/in-memory-queue";

const WORKER_OPTIONS = {
  connection: connectionConfig,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
};

export const flashcardWorker = new Worker<FlashcardJobData, FlashcardJobResult>(
  "flashcard-generation",
  async (job: Job<FlashcardJobData>) => processFlashcardData(job.data, job.id),
  WORKER_OPTIONS
);

export const syllabusWorker = new Worker<SyllabusJobData, SyllabusJobResult>(
  "syllabus-generation",
  async (job: Job<SyllabusJobData>) => processSyllabusData(job.data, job.id),
  WORKER_OPTIONS
);

export const scheduleWorker = new Worker<ScheduleJobData, ScheduleJobResult>(
  "schedule-generation",
  async (job: Job<ScheduleJobData>) => processScheduleData(job.data, job.id),
  WORKER_OPTIONS
);

memFlashcardQueue.process("generate-flashcards", async (data: FlashcardJobData) => {
  return processFlashcardData(data);
});

memSyllabusQueue.process("process-syllabus", async (data: SyllabusJobData) => {
  return processSyllabusData(data);
});

memScheduleQueue.process("process-schedule", async (data: ScheduleJobData) => {
  return processScheduleData(data);
});

flashcardWorker.on("completed", (job) => {
  console.log(`[FLASHCARD_WORKER] BullMQ Job ${job.id} completed`);
});

flashcardWorker.on("failed", (job, err) => {
  console.error(`[FLASHCARD_WORKER] BullMQ Job ${job?.id} failed:`, err.message);
});

syllabusWorker.on("completed", (job) => {
  console.log(`[SYLLABUS_WORKER] BullMQ Job ${job.id} completed`);
});

syllabusWorker.on("failed", (job, err) => {
  console.error(`[SYLLABUS_WORKER] BullMQ Job ${job?.id} failed:`, err.message);
});

scheduleWorker.on("completed", (job) => {
  console.log(`[SCHEDULE_WORKER] BullMQ Job ${job.id} completed`);
});

scheduleWorker.on("failed", (job, err) => {
  console.error(`[SCHEDULE_WORKER] BullMQ Job ${job?.id} failed:`, err.message);
});

memFlashcardQueue.on("completed", () => {
  console.log(`[FLASHCARD_WORKER] In-memory job completed`);
});

memFlashcardQueue.on("failed", () => {
  console.error(`[FLASHCARD_WORKER] In-memory job failed`);
});

export const allWorkers = [flashcardWorker, syllabusWorker, scheduleWorker];
