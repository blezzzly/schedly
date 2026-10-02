import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { categorizeError, withRetry, sleep } from "@/server/ai/retry-manager";

describe("categorizeError", () => {
  it("categorizes 429 rate limits", () => {
    const err = new Error("429 Too Many Requests");
    const result = categorizeError(err, 429);
    expect(result.category).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("categorizes quota errors as non-retryable", () => {
    const err = new Error("RESOURCE_EXHAUSTED");
    const result = categorizeError(err);
    expect(result.category).toBe("quota");
    expect(result.retryable).toBe(false);
  });

  it("categorizes 401/403 auth errors as non-retryable", () => {
    expect(categorizeError(new Error("Unauthorized"), 401).category).toBe("auth");
    expect(categorizeError(new Error("Forbidden"), 403).category).toBe("auth");
    expect(categorizeError(new Error("Unauthorized"), 401).retryable).toBe(false);
  });

  it("categorizes 400/422 as invalid_request non-retryable", () => {
    expect(categorizeError(new Error("Bad request"), 400).category).toBe("invalid_request");
    expect(categorizeError(new Error("Unprocessable"), 422).category).toBe("invalid_request");
  });

  it("categorizes 5xx as server errors retryable", () => {
    expect(categorizeError(new Error("Service unavailable"), 503).category).toBe("server");
    expect(categorizeError(new Error("Service unavailable"), 503).retryable).toBe(true);
  });

  it("categorizes network errors as retryable", () => {
    const result = categorizeError(new Error("fetch failed"));
    expect(result.category).toBe("network");
    expect(result.retryable).toBe(true);
  });

  it("extracts retryAfter from error object", () => {
    const err = Object.assign(new Error("rate limit"), { retryAfter: 30 });
    const result = categorizeError(err, 429);
    expect(result.retryAfterMs).toBe(30_000);
  });

  it("returns unknown for unrecognized errors", () => {
    const result = categorizeError(new Error("something weird"));
    expect(result.category).toBe("unknown");
    expect(result.retryable).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn(async () => "success");
    const result = await withRetry(fn, { operationName: "test" });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors and eventually succeeds", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        const err = new Error("503 Service Unavailable") as Error & { status: number };
        throw err;
      }
      return "success";
    };
    const result = await withRetry(fn, { operationName: "test", baseDelay: 1, maxDelay: 10 });
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      const err = new Error("401 Unauthorized") as Error & { status: number };
      throw err;
    });
    await expect(withRetry(fn, { operationName: "test" })).rejects.toThrow("401");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    const fn = vi.fn(async () => {
      const err = new Error("503") as Error & { status: number };
      throw err;
    });
    await expect(
      withRetry(fn, { operationName: "test", maxRetries: 2, baseDelay: 1, maxDelay: 10 }),
    ).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
