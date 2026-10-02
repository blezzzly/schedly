import { connectRedis } from "./redis";
import type { InMemoryQueue } from "./in-memory-queue";

let queuesModule: any = null;
let detectedMode: "bullmq" | "in-memory" | "pending" = "pending";

async function detectMode(): Promise<"bullmq" | "in-memory"> {
  if (detectedMode !== "pending") return detectedMode;

  const redisAvailable = await connectRedis();
  if (redisAvailable) {
    try {
      const queues = await import("./queues");
      queuesModule = queues;
      detectedMode = "bullmq";
      console.log("[QUEUE_SERVICE] Using BullMQ (Redis-backed)");
    } catch (err) {
      console.warn("[QUEUE_SERVICE] Failed to load BullMQ, falling back to in-memory:", err);
      detectedMode = "in-memory";
    }
  } else {
    detectedMode = "in-memory";
    console.log("[QUEUE_SERVICE] Redis not available, using in-memory queue");
  }

  return detectedMode;
}

export async function enqueueFlashcardJob(data: any): Promise<string> {
  const mode = await detectMode();
  if (mode === "bullmq") {
    const job = await queuesModule.flashcardQueue.add("generate-flashcards", data, { priority: 5 });
    return job.id!;
  } else {
    const inMem = await import("./in-memory-queue");
    return inMem.flashcardQueue.add("generate-flashcards", data);
  }
}

export async function enqueueSyllabusJob(data: any): Promise<string> {
  const mode = await detectMode();
  if (mode === "bullmq") {
    const job = await queuesModule.syllabusQueue.add("process-syllabus", data, { priority: 5 });
    return job.id!;
  } else {
    const inMem = await import("./in-memory-queue");
    return inMem.syllabusQueue.add("process-syllabus", data);
  }
}

export async function enqueueScheduleJob(data: any): Promise<string> {
  const mode = await detectMode();
  if (mode === "bullmq") {
    const job = await queuesModule.scheduleQueue.add("process-schedule", data, { priority: 5 });
    return job.id!;
  } else {
    const inMem = await import("./in-memory-queue");
    return inMem.scheduleQueue.add("process-schedule", data);
  }
}

export async function getJobStatus(queueName: string, jobId: string) {
  const mode = await detectMode();
  if (mode === "bullmq") {
    let queue;
    switch (queueName) {
      case "flashcard-generation":
        queue = queuesModule.flashcardQueue;
        break;
      case "syllabus-generation":
        queue = queuesModule.syllabusQueue;
        break;
      case "schedule-generation":
        queue = queuesModule.scheduleQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      state,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
    };
  } else {
    const inMem = await import("./in-memory-queue");
    let queue: InMemoryQueue;
    switch (queueName) {
      case "flashcard-generation":
        queue = inMem.flashcardQueue;
        break;
      case "syllabus-generation":
        queue = inMem.syllabusQueue;
        break;
      case "schedule-generation":
        queue = inMem.scheduleQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    const job = await queue.getJob(jobId);
    if (!job) return null;
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state: job.state,
      attemptsMade: job.attempts,
      failedReason: job.failedReason,
    };
  }
}

export async function getQueueStats(queueName: string) {
  const mode = await detectMode();
  if (mode === "bullmq") {
    let queue;
    switch (queueName) {
      case "flashcard-generation":
        queue = queuesModule.flashcardQueue;
        break;
      case "syllabus-generation":
        queue = queuesModule.syllabusQueue;
        break;
      case "schedule-generation":
        queue = queuesModule.scheduleQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  } else {
    const inMem = await import("./in-memory-queue");
    let queue: InMemoryQueue;
    switch (queueName) {
      case "flashcard-generation":
        queue = inMem.flashcardQueue;
        break;
      case "syllabus-generation":
        queue = inMem.syllabusQueue;
        break;
      case "schedule-generation":
        queue = inMem.scheduleQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
    return queue.getStats();
  }
}

export async function getQueueMode(): Promise<"bullmq" | "in-memory"> {
  return detectMode();
}
