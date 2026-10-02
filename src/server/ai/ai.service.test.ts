import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchSequence(responses: Array<{ body: string; status?: number; contentType?: string; headers?: Record<string, string> }>) {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const r = responses[i++] ?? responses[responses.length - 1]!;
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: {
        get: (name: string) => r.headers?.[name.toLowerCase()] ?? r.contentType ?? "application/json",
      },
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
      arrayBuffer: async () => new TextEncoder().encode(r.body).buffer,
    } as unknown as Response;
  }) as typeof fetch;
}

function geminiSuccessResponse(cards: unknown[] = [{ question: "Q?", answer: "A" }]) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify({ cards }) }] } }],
  };
}

function openRouterSuccessResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

function groqSuccessResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

// Timeout rationale is documented at the bottom of this block.
describe("ai-gateway (generateWithFallback)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini";
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENROUTER_API_KEY = "test-or";
    delete process.env.OPENROUTER_DISABLED;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("returns success on first provider", async () => {
    mockFetchSequence([{ body: JSON.stringify(geminiSuccessResponse()) }]);

    const { generateWithFallback } = await import("@/server/ai/ai.service");
    const result = await generateWithFallback(
      "FLASHCARD_GENERATION",
      { text: "study material" },
    );
    expect(result.success).toBe(true);
    expect(result.provider).toBe("gemini");
    expect(result.usedFallback).toBe(false);
  });

  it("falls back to next provider on failure", async () => {
    mockFetchSequence([
      { body: "{}", status: 500, contentType: "application/json" },
      { body: JSON.stringify(groqSuccessResponse(JSON.stringify({ cards: [{ question: "Q", answer: "A" }] }))) },
    ]);

    const { generateWithFallback } = await import("@/server/ai/ai.service");
    const result = await generateWithFallback(
      "FLASHCARD_GENERATION",
      { text: "study material" },
      { maxTokens: 100 },
    );
    expect(result.success).toBe(true);
    expect(result.provider).toBe("groq");
    expect(result.usedFallback).toBe(true);
  });

  it("falls back through all providers when all fail", async () => {
    mockFetchSequence([
      { body: "{}", status: 500, contentType: "application/json" },
      { body: "{}", status: 500, contentType: "application/json" },
      { body: "{}", status: 500, contentType: "application/json" },
    ]);

    const { generateWithFallback } = await import("@/server/ai/ai.service");
    const result = await generateWithFallback(
      "FLASHCARD_GENERATION",
      { text: "study material" },
      { maxTokens: 100 },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("All AI providers failed");
  });

  it("handles 429 rate limit by failing fast and moving to next provider", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ error: { message: "Too many requests" } }),
        json: async () => ({ error: { message: "Too many requests" } }),
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }) as typeof fetch;

    const { generateWithFallback } = await import("@/server/ai/ai.service");
    const result = await generateWithFallback(
      "FLASHCARD_GENERATION",
      { text: "test" },
    );
    expect(result.success).toBe(false);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it("handles malformed JSON response gracefully", async () => {
    mockFetchSequence([
      { body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json at all" }] } }] }) },
    ]);

    const { generateWithFallback } = await import("@/server/ai/ai.service");
    const result = await generateWithFallback(
      "FLASHCARD_GENERATION",
      { text: "test" },
    );
    expect(result.success).toBe(false);
  });

  it("handles provider returning empty content", async () => {
    mockFetchSequence([
      { body: JSON.stringify({ candidates: [{ content: { parts: [{}] } }] }) },
    ]);

    const { generateWithFallback } = await import("@/server/ai/ai.service");
    const result = await generateWithFallback(
      "FLASHCARD_GENERATION",
      { text: "test" },
    );
    expect(result.success).toBe(false);
  });

  // 20s for the whole block, because the time here is not spent in the code
  // under test. `fetch` is mocked, so the gateway returns immediately; almost all
  // of it is the `await import()` inside each test, which `vi.resetModules()` in
  // beforeEach forces to re-transform ai.service on every single case.
  //
  // At the 5s default that re-transform lands right on the limit and the suite
  // fails intermittently on a loaded machine or a CI runner. It passed locally
  // and failed in CI on the same commit, which is the worst version of this bug:
  // a red build with nothing actually wrong.
}, 20_000);
