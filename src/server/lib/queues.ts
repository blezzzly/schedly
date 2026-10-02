import { Queue, QueueEvents } from "bullmq";

const connectionConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const QUEUE_OPTIONS = {
  connection: connectionConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
      count: 5000,
    },
  },
};

export const flashcardQueue = new Queue("flashcard-generation", QUEUE_OPTIONS);

export const syllabusQueue = new Queue("syllabus-generation", QUEUE_OPTIONS);

export const scheduleQueue = new Queue("schedule-generation", QUEUE_OPTIONS);

export const flashcardQueueEvents = new QueueEvents("flashcard-generation", {
  connection: connectionConfig,
});

export const syllabusQueueEvents = new QueueEvents("syllabus-generation", {
  connection: connectionConfig,
});

export const scheduleQueueEvents = new QueueEvents("schedule-generation", {
  connection: connectionConfig,
});

export { connectionConfig };

export default {
  flashcardQueue,
  syllabusQueue,
  scheduleQueue,
  flashcardQueueEvents,
  syllabusQueueEvents,
  scheduleQueueEvents,
};
