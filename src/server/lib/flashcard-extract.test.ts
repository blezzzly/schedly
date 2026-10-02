import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFlashcards, generateFlashcardsFromImage } from "@/server/lib/flashcard-extract";
import { generateWithFallback } from "@/server/ai/ai.service";

vi.mock("@/server/ai/ai.service", () => ({
  generateWithFallback: vi.fn(),
}));

function setupMock(data: Record<string, unknown> | null, success = true) {
  vi.mocked(generateWithFallback).mockReset();
  vi.mocked(generateWithFallback).mockResolvedValue(
    success ? { success: true, data: data ?? {} } : { success: false, error: "all failed" },
  );
}

describe("generateFlashcards", () => {
  beforeEach(() => {
    vi.mocked(generateWithFallback).mockReset();
  });

  it("rejects empty/short content", async () => {
    await expect(generateFlashcards("", 10)).rejects.toThrow();
    await expect(generateFlashcards("short", 10)).rejects.toThrow();
  });

  it("deduplicates identical cards", async () => {
    setupMock({
      cards: [
        { question: "What is X?", answer: "X" },
        { question: "What is X?", answer: "X" },
        { question: "What is Y?", answer: "Y" },
        { question: "", answer: "no q" },
        { question: "Q?", answer: "" },
      ],
    });

    const result = await generateFlashcards("a".repeat(100), 10);
    expect(result.cards).toHaveLength(2);
    expect(result.cards.find((c) => c.question === "")).toBeUndefined();
  });

  it("truncates answers to 500 chars", async () => {
    setupMock({ cards: [{ question: "Q?", answer: "a".repeat(1000) }] });
    const result = await generateFlashcards("a".repeat(100), 5);
    expect(result.cards[0]!.answer.length).toBeLessThanOrEqual(500);
  });

  it("uses topic-aware prompt when provided", async () => {
    setupMock({ cards: [] });
    await generateFlashcards("a".repeat(100), 5, "data structures");
    const calls = vi.mocked(generateWithFallback).mock.calls;
    expect(calls[0]![2]?.prompt).toContain("topic");
    expect(calls[0]![2]?.prompt).not.toContain("IF a topic is provided");
  });

  it("passes text to AI gateway", async () => {
    setupMock({ cards: [] });
    await generateFlashcards("a".repeat(100), 5);
    const calls = vi.mocked(generateWithFallback).mock.calls;
    expect(calls[0]![0]).toBe("FLASHCARD_GENERATION");
    expect(calls[0]![1]).toHaveProperty("text");
  });

  it("throws when AI gateway fails", async () => {
    setupMock(null, false);
    await expect(generateFlashcards("a".repeat(100), 5)).rejects.toThrow();
  });
});

describe("generateFlashcardsFromImage", () => {
  beforeEach(() => {
    vi.mocked(generateWithFallback).mockReset();
  });

  it("passes image data to AI gateway", async () => {
    vi.mocked(generateWithFallback).mockResolvedValue({
      success: true,
      data: { cards: [{ question: "Q1", answer: "A1" }] },
    });

    const result = await generateFlashcardsFromImage("aGVsbG8=", "image/jpeg", 5);
    expect(result.cards).toHaveLength(1);
    const calls = vi.mocked(generateWithFallback).mock.calls;
    expect(calls[0]![1]).toHaveProperty("image");
    expect((calls[0]![1] as { image: unknown }).image).toEqual({
      base64: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
  });
});
