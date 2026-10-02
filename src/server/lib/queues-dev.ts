import { Queue, Worker, QueueEvents } from "bullmq";

const mockRedis = {
  connected: true,
  async ping() { return "PONG"; },
  async quit() { this.connected = false; },
  on() { return this; },
};

const connectionConfig = {
  host: "mock-redis",
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  _isMock: true,
};

const QUEUE_OPTIONS = {
  connection: mockRedis,
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "fixed",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
};

export const flashcardQueue = new Queue("flashcard-generation", QUEUE_OPTIONS);
export const syllabusQueue = new Queue("syllabus-generation", QUEUE_OPTIONS);
export const scheduleQueue = new Queue("schedule-generation", QUEUE_OPTIONS);

export const flashcardQueueEvents = new QueueEvents("flashcard-generation", { connection: mockRedis });
export const syllabusQueueEvents = new QueueEvents("syllabus-generation", { connection: mockRedis });
export const scheduleQueueEvents = new QueueEvents("schedule-generation", { connection: mockRedis });

export { mockRedis, connectionConfig };

export default {
  flashcardQueue,
  syllabusQueue,
  scheduleQueue,
  flashcardQueueEvents,
  syllabusQueueEvents,
  scheduleQueueEvents,
};
