import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordSuccess,
  recordFailure,
  isKeyAvailable,
  getHealth,
  getProviderStatus,
  getAllProviderStatuses,
} from "@/server/ai/circuit-breaker";

describe("circuit-breaker (per-key)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts as available for all providers", () => {
    expect(isKeyAvailable("gemini", 0)).toBe(true);
    expect(isKeyAvailable("groq", 0)).toBe(true);
  });

  it("records success without affecting availability", () => {
    recordSuccess("gemini", 0);
    expect(isKeyAvailable("gemini", 0)).toBe(true);
  });

  it("opens after threshold failures", () => {
    for (let i = 0; i < 5; i++) {
      recordFailure("gemini", 0);
    }
    expect(isKeyAvailable("gemini", 0)).toBe(false);
    expect(getHealth("gemini", 0)).toBe("QUOTA_EXHAUSTED");
  });

  it("reset after success closes the breaker", () => {
    for (let i = 0; i < 5; i++) {
      recordFailure("gemini", 0);
    }
    expect(isKeyAvailable("gemini", 0)).toBe(false);

    recordSuccess("gemini", 0);
    expect(isKeyAvailable("gemini", 0)).toBe(true);
  });

  it("tracks per-key independently", () => {
    for (let i = 0; i < 5; i++) {
      recordFailure("gemini", 0);
    }
    expect(isKeyAvailable("gemini", 0)).toBe(false);
    expect(isKeyAvailable("gemini", 1)).toBe(true);
  });

  it("getProviderStatus returns key-level breakdown", () => {
    const status = getProviderStatus("gemini");
    expect(status.id).toBe("gemini");
    expect(Array.isArray(status.keys)).toBe(true);
  });

  it("getAllProviderStatuses returns all providers", () => {
    const statuses = getAllProviderStatuses();
    expect(statuses.length).toBe(4);
    expect(statuses.map((s) => s.id)).toEqual(["gemini", "groq", "openrouter", "bytez"]);
  });
});
