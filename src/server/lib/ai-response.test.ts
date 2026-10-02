import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression test: when the OpenRouter provider returns a NON-JSON body
 * (HTML error page, gateway failure, truncated payload), the pipeline must
 * throw a clean, catchable Error — never a raw SyntaxError like
 * `Unexpected token 'A', "An error o..." is not valid JSON`.
 */

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(body: string, init: { status?: number; contentType?: string } = {}) {
  globalThis.fetch = vi.fn(async () => {
    return {
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      headers: { get: () => init.contentType ?? "text/html" },
      text: async () => body,
      json: async () => JSON.parse(body),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("callOpenRouter — non-JSON provider response", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("throws a clean Error (not a SyntaxError) on an HTML error body", async () => {
    mockFetchOnce("<html><body>An error occurred while processing</body></html>", { status: 200 });
    const { callOpenRouterTest } = await import("./ai");
    let thrown: unknown;
    try {
      await callOpenRouterTest("google/gemma-4-26b-a4b-it:free", []);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(SyntaxError);
    expect(String((thrown as Error).message)).toContain("non-JSON response");
  });

  it("throws a clean Error when the model content is not JSON", async () => {
    mockFetchOnce(
      JSON.stringify({
        choices: [{ message: { content: "An error occurred while reading the image" } }],
      }),
      { status: 200, contentType: "application/json" },
    );
    const { callOpenRouterTest, parseAiResponseTest } = await import("./ai");
    const data = await callOpenRouterTest("google/gemma-4-26b-a4b-it:free", []);
    let thrown: unknown;
    try {
      parseAiResponseTest(data);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toContain("No JSON in AI response");
  });
});
