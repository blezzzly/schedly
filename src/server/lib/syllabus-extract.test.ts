import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractSyllabusFromText, extractSyllabusFromImage } from "@/server/lib/syllabus-extract";
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

describe("extractSyllabusFromText", () => {
  beforeEach(() => {
    vi.mocked(generateWithFallback).mockReset();
  });

  it("rejects empty/short content", async () => {
    await expect(extractSyllabusFromText("")).rejects.toThrow();
    await expect(extractSyllabusFromText("short")).rejects.toThrow();
  });

  it("returns normalized course + requirements", async () => {
    setupMock({
      course: { name: "Intro to CS", code: "CS101", section: "A" },
      requirements: [
        { title: "Midterm Exam", type: "exam", date: "2026-10-15", date_precision: "exact" },
        { title: "Project", type: "project", date: null, date_precision: "unspecified" },
      ],
    });

    const result = await extractSyllabusFromText("a".repeat(30));
    expect(result.course.name).toBe("Intro to CS");
    expect(result.course.code).toBe("CS101");
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0]!.type).toBe("exam");
  });

  it("deduplicates identical requirements", async () => {
    setupMock({
      course: {},
      requirements: [
        { title: "Quiz 1", type: "quiz" },
        { title: "Quiz 1", type: "quiz" },
        { title: "Final", type: "exam" },
      ],
    });

    const result = await extractSyllabusFromText("a".repeat(30));
    expect(result.requirements).toHaveLength(2);
  });

  it("normalizes unknown requirement types to 'other'", async () => {
    setupMock({ course: {}, requirements: [{ title: "Mystery task", type: "unknown_type" }] });
    const result = await extractSyllabusFromText("a".repeat(30));
    expect(result.requirements[0]!.type).toBe("other");
  });

  it("normalizes unknown date precision to 'unspecified'", async () => {
    setupMock({ course: {}, requirements: [{ title: "Assignment", type: "assignment", date_precision: "garbage" }] });
    const result = await extractSyllabusFromText("a".repeat(30));
    expect(result.requirements[0]!.date_precision).toBe("unspecified");
  });

  it("throws when AI gateway fails", async () => {
    setupMock(null, false);
    await expect(extractSyllabusFromText("a".repeat(30))).rejects.toThrow();
  });

  it("truncates input to 15,000 chars", async () => {
    setupMock({ course: {}, requirements: [] });
    await extractSyllabusFromText("a".repeat(30_000));
    const calls = vi.mocked(generateWithFallback).mock.calls;
    expect((calls[0]![1] as { text: string }).text.length).toBe(15_000);
  });
});

describe("extractSyllabusFromImage", () => {
  beforeEach(() => {
    vi.mocked(generateWithFallback).mockReset();
  });

  it("passes image data to AI gateway", async () => {
    vi.mocked(generateWithFallback).mockResolvedValue({
      success: true,
      data: { course: { name: "Biology" }, requirements: [] },
    });

    const result = await extractSyllabusFromImage("aGVsbG8=", "image/jpeg");
    expect(result.course.name).toBe("Biology");
    const calls = vi.mocked(generateWithFallback).mock.calls;
    expect(calls[0]![1]).toHaveProperty("image");
    expect((calls[0]![1] as { image: unknown }).image).toEqual({
      base64: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
  });
});
