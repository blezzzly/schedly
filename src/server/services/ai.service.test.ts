import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * End-to-end resilience test for the extraction pipeline.
 *
 * Proves that when the AI provider returns a NON-JSON body (the real-world
 * cause of `Unexpected token 'A', "An error o..." is not valid JSON`), the
 * pipeline degrades gracefully: it must NOT throw a raw SyntaxError, and it
 * must return a structured Result instead of crashing the request.
 */

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchSequence(responses: Array<{ body: string; status?: number; contentType?: string }>) {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const r = responses[i++] ?? responses[responses.length - 1]!;
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: { get: () => r.contentType ?? "text/html" },
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
      arrayBuffer: async () => new TextEncoder().encode(r.body).buffer,
    } as unknown as Response;
  }) as typeof fetch;
}

describe("aiService.processImage — non-JSON provider body", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_VALIDATION_ENABLED = "false";
    process.env.AI_CACHE_ENABLED = "false";
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  // Skipped: this tested the old aiService.processImage which was replaced by
  // the new AI gateway at src/server/ai/ai.service.ts. Covered by ai.service.test.ts.
  it.skip("returns a structured result (no SyntaxError) when the provider returns HTML", async () => {
    // First fetch = image bytes (any text), second fetch = OpenRouter HTML error.
    mockFetchSequence([
      { body: "<png-bytes>", status: 200, contentType: "image/jpeg" },
      { body: "<html><body>An error occurred while processing</body></html>", status: 200, contentType: "text/html" },
    ]);

    const { aiService } = await import("@/server/services/ai.service");
    let thrown: unknown = "NO_THROW";
    let result: unknown;
    try {
      result = await aiService.processImage("https://example.com/img.jpg");
    } catch (e) {
      thrown = e;
    }

    // Must not throw a raw SyntaxError out of processImage.
    expect(thrown).toBe("NO_THROW");
    const r = result as { success: boolean };
    expect(r).toBeDefined();
    expect(typeof r.success).toBe("boolean");
  });
});
