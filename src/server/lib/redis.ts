import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisInstance: Redis | null = null;
let redisAvailable: boolean | null = null; // null = unknown, true/false = tested
let lastErrorLog = 0;
const ERROR_LOG_COOLDOWN_MS = 30_000; // only log Redis errors every 30s

function isConnectionRefused(err: any): boolean {
  if (err?.code === "ECONNREFUSED") return true;
  if (err?.message?.includes("ECONNREFUSED")) return true;
  // AggregateError wraps individual connection errors
  if (err?.errors?.some?.((e: any) => e?.code === "ECONNREFUSED" || e?.message?.includes("ECONNREFUSED"))) return true;
  return false;
}

function createRedis(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 50, 2000);
    },
    reconnectOnError(err) {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) return true;
      return false;
    },
  });
}

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = createRedis();
    redisInstance.on("error", (err) => {
      // Suppress ECONNREFUSED entirely — Redis is optional
      if (isConnectionRefused(err)) {
        redisAvailable = false;
        // Log only once, then stay silent
        if (lastErrorLog === 0) {
          lastErrorLog = Date.now();
          console.warn("[REDIS] Not available — running without Redis. Set REDIS_URL to enable.");
        }
        return;
      }
      // For other errors, apply cooldown to avoid spam
      const now = Date.now();
      if (now - lastErrorLog > ERROR_LOG_COOLDOWN_MS) {
        lastErrorLog = now;
        console.error("[REDIS] Connection error:", err);
      }
    });
    redisInstance.on("connect", () => {
      redisAvailable = true;
      lastErrorLog = 0;
      console.log("[REDIS] Connected successfully");
    });
  }
  return redisInstance;
}

export async function connectRedis(): Promise<boolean> {
  // If we already know Redis is down, don't keep trying
  if (redisAvailable === false) return false;
  try {
    const redis = getRedis();
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.ping();
    redisAvailable = true;
    return true;
  } catch {
    redisAvailable = false;
    return false;
  }
}

export const isRedisConnected = connectRedis;

export default {
  getRedis,
  connectRedis,
  isRedisConnected,
};
