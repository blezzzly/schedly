/**
 * In-process job queue for development and small-scale deployments
 * Falls back to in-memory processing when Redis is not available
 * 
 * For production, use the BullMQ-based system in queues.ts
 */
type JobHandler<T = unknown, R = unknown> = (data: T) => Promise<R>;
type JobCallback = () => void;

interface JobRecord<T = unknown> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  state: "waiting" | "active" | "completed" | "failed" | "delayed";
  failedReason?: string;
  result?: unknown;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

interface QueueConfig {
  name: string;
  concurrency: number;
  maxAttempts: number;
  backoff: {
    type: "fixed" | "exponential";
    delay: number;
  };
}

class InMemoryQueue<T = unknown, R = unknown> {
  private jobs: Map<string, JobRecord<T>> = new Map();
  private waitingJobs: string[] = [];
  private handlers: Map<string, JobHandler<T, R>> = new Map();
  private activeJobs = 0;
  private config: QueueConfig;
  private listeners: Map<string, Set<JobCallback>> = new Map();
  private polling = false;

  constructor(config: QueueConfig) {
    this.config = config;
    this.startPolling();
  }

  add(name: string, data: T, options?: { priority?: number }): string {
    const job: JobRecord<T> = {
      id: `${this.config.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      data,
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      state: "waiting",
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    this.waitingJobs.push(job.id);
    console.log(`[QUEUE:${this.config.name}] Job ${job.id} enqueued`);
    this.processNext();
    return job.id;
  }

  process(name: string, handler: JobHandler<T, R>): void {
    this.handlers.set(name, handler);
  }

  on(event: string, callback: JobCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  emit(event: string): void {
    this.listeners.get(event)?.forEach((cb) => cb());
  }

  private async startPolling(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    while (this.polling) {
      this.processNext();
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  stop(): void {
    this.polling = false;
  }

  private async processNext(): Promise<void> {
    while (this.activeJobs < this.config.concurrency && this.waitingJobs.length > 0) {
      const jobId = this.waitingJobs.shift()!;
      const job = this.jobs.get(jobId);
      if (!job || job.state !== "waiting") continue;

      const handler = this.handlers.get(job.name);
      if (!handler) {
        console.error(`[QUEUE:${this.config.name}] No handler for job ${job.name}`);
        job.state = "failed";
        job.failedReason = `No handler for ${job.name}`;
        job.finishedAt = Date.now();
        continue;
      }

      this.activeJobs++;
      job.state = "active";
      job.startedAt = Date.now();
      job.attempts++;
      this.emit("active");

      this.runJob(job, handler).catch((err) => {
        console.error(`[QUEUE:${this.config.name}] Unhandled error:`, err);
      });
    }
  }

  private async runJob(job: JobRecord<T>, handler: JobHandler<T, R>): Promise<void> {
    try {
      const result = await handler(job.data);
      job.state = "completed";
      job.result = result;
      job.finishedAt = Date.now();
      this.activeJobs--;
      console.log(`[QUEUE:${this.config.name}] Job ${job.id} completed`);
      this.emit("completed");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      job.failedReason = error.message;
      this.activeJobs--;

      if (job.attempts < job.maxAttempts) {
        const delay = this.config.backoff.type === "exponential"
          ? this.config.backoff.delay * Math.pow(2, job.attempts - 1)
          : this.config.backoff.delay;
        console.log(`[QUEUE:${this.config.name}] Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}), retrying in ${delay}ms:`, error.message);
        job.state = "waiting";
        setTimeout(() => {
          this.waitingJobs.push(job.id);
          this.processNext();
        }, delay);
      } else {
        job.state = "failed";
        job.finishedAt = Date.now();
        console.error(`[QUEUE:${this.config.name}] Job ${job.id} failed after ${job.attempts} attempts:`, error.message);
        this.emit("failed");
      }
    }
    this.processNext();
  }

  async getJob(jobId: string): Promise<JobRecord<T> | null> {
    return this.jobs.get(jobId) || null;
  }

  async getStats(): Promise<{ waiting: number; active: number; completed: number; failed: number; delayed: number }> {
    let waiting = 0, active = 0, completed = 0, failed = 0, delayed = 0;
    for (const job of this.jobs.values()) {
      if (job.state === "waiting") waiting++;
      else if (job.state === "active") active++;
      else if (job.state === "completed") completed++;
      else if (job.state === "failed") failed++;
      else if (job.state === "delayed") delayed++;
    }
    return { waiting, active, completed, failed, delayed };
  }
}

export const flashcardQueue = new InMemoryQueue({
  name: "flashcard-generation",
  concurrency: 5,
  maxAttempts: 3,
  backoff: { type: "exponential", delay: 2000 },
});

export const syllabusQueue = new InMemoryQueue({
  name: "syllabus-generation",
  concurrency: 3,
  maxAttempts: 3,
  backoff: { type: "exponential", delay: 2000 },
});

export const scheduleQueue = new InMemoryQueue({
  name: "schedule-generation",
  concurrency: 3,
  maxAttempts: 3,
  backoff: { type: "exponential", delay: 2000 },
});

export { InMemoryQueue };
export type { JobRecord };

export const isInMemoryMode = true;
