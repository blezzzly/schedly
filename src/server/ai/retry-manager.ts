import { PipelineLogger } from "@/server/lib/structured-logger";

export type ErrorCategory = "rate_limit" | "quota" | "auth" | "invalid_request" | "network" | "server" | "unknown";

export interface CategorizedError {
  category: ErrorCategory;
  retryable: boolean;
  retryAfterMs?: number;
  message: string;
  originalError: unknown;
}

const RETRY_AFTER_DEFAULT = 10_000;
const MAX_RETRIES = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.status === "number") return obj.status;
    const msg = typeof obj.message === "string" ? obj.message : "";
    const match = msg.match(/\b(\d{3})\b/);
    if (match) {
      const n = parseInt(match[1]!);
      if (n >= 100 && n < 600) return n;
    }
  }
  return undefined;
}

function extractRetryAfter(err: unknown): number | null {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.retryAfter === "number") return obj.retryAfter;
    if (typeof obj.retry_after === "number") return obj.retry_after;
    if (typeof obj.retryAfterSeconds === "number") return obj.retryAfterSeconds;
  }
  return null;
}

export function categorizeError(err: unknown, status?: number): CategorizedError {
  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();
  const errStatus = status ?? extractStatus(err);

  if (errStatus === 429 || /429|rate.limit|too many|rate_limit/i.test(lowerMessage)) {
    const retryAfter = extractRetryAfter(err) ?? RETRY_AFTER_DEFAULT;
    return {
      category: "rate_limit",
      retryable: true,
      retryAfterMs: retryAfter * 1000,
      message,
      originalError: err,
    };
  }

  if (/quota|resource_exhausted|exceeded|insufficient_quota/i.test(lowerMessage)) {
    return {
      category: "quota",
      retryable: false,
      message,
      originalError: err,
    };
  }

  if (errStatus === 401 || errStatus === 403 || /unauthorized|invalid.*key|api.*key.*invalid/i.test(lowerMessage)) {
    return {
      category: "auth",
      retryable: false,
      message,
      originalError: err,
    };
  }

  if (errStatus === 400 || errStatus === 422 || /invalid.*argument|unsupported|bad request/i.test(lowerMessage)) {
    return {
      category: "invalid_request",
      retryable: false,
      message,
      originalError: err,
    };
  }

  if (errStatus && errStatus >= 500) {
    return {
      category: "server",
      retryable: true,
      retryAfterMs: RETRY_AFTER_DEFAULT,
      message,
      originalError: err,
    };
  }

  if (/network|fetch failed|timeout|abort|connection|econnreset|enotfound/i.test(lowerMessage)) {
    return {
      category: "network",
      retryable: true,
      retryAfterMs: RETRY_AFTER_DEFAULT,
      message,
      originalError: err,
    };
  }

  return {
    category: "unknown",
    retryable: false,
    message,
    originalError: err,
  };
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  operationName?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  const baseDelay = opts.baseDelay ?? 1_000;
  const maxDelay = opts.maxDelay ?? 10_000;
  const opName = opts.operationName ?? "operation";

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const categorized = categorizeError(err);

      if (!categorized.retryable) {
        PipelineLogger.debug("retry", `${opName} not retryable`, { category: categorized.category });
        throw err;
      }

      if (attempt >= maxRetries) {
        PipelineLogger.debug("retry", `${opName} exhausted retries`, { attempts: attempt + 1 });
        break;
      }

      const baseWait = categorized.retryAfterMs ?? baseDelay;
      const delay = Math.min(baseWait * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * (delay * 0.3);
      const totalDelay = delay + jitter;

      PipelineLogger.debug("retry", `${opName} retrying`, {
        attempt: attempt + 1,
        delayMs: Math.round(totalDelay),
        category: categorized.category,
      });

      await sleep(totalDelay);
    }
  }

  throw lastError;
}
