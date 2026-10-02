#!/usr/bin/env node
/**
 * Worker process entry point
 * 
 * Supports both:
 * 1. BullMQ (requires Redis) - for production
 * 2. In-memory queue - for development without Redis
 * 
 * Usage:
 *   npm run worker     # Production mode (BullMQ)
 *   npm run dev:worker # Development mode (in-memory, auto-starts)
 */
import { isRedisConnected } from "../lib/redis";
import { flashcardQueue, syllabusQueue, scheduleQueue } from "../lib/in-memory-queue";
import { processFlashcardData } from "./flashcard-worker";
import { processSyllabusData } from "./syllabus-worker";
import { processScheduleData } from "./schedule-worker";

flashcardQueue.process("generate-flashcards", async (data: any) => {
  console.log(`[FLASHCARD_WORKER] Processing job for upload ${data.uploadId}`);
  return processFlashcardData(data);
});

syllabusQueue.process("process-syllabus", async (data: any) => {
  console.log(`[SYLLABUS_WORKER] Processing job for syllabus ${data.syllabusId}`);
  return processSyllabusData(data);
});

scheduleQueue.process("process-schedule", async (data: any) => {
  console.log(`[SCHEDULE_WORKER] Processing job for schedule ${data.scheduleId}`);
  return processScheduleData(data);
});

flashcardQueue.on("completed", () => {
  console.log(`[FLASHCARD_WORKER] Job completed`);
});

flashcardQueue.on("failed", () => {
  console.error(`[FLASHCARD_WORKER] Job failed`);
});

console.log("=".repeat(50));
console.log("[WORKER] Starting in-memory queue workers...");
console.log("=".repeat(50));
console.log("[WORKER] Flashcard worker: ready");
console.log("[WORKER] Syllabus worker: ready");
console.log("[WORKER] Schedule worker: ready");
console.log("[WORKER] Listening for jobs (in-memory mode)...");

const shutdown = () => {
  console.log("\n[WORKER] Shutting down...");
  flashcardQueue.stop();
  syllabusQueue.stop();
  scheduleQueue.stop();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
