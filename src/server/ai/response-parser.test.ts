import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractJsonFromText, safeJsonParse, tryRepairJson } from "@/server/ai/response-parser";

describe("extractJsonFromText", () => {
  it("parses plain JSON", () => {
    const result = extractJsonFromText('{"a": 1, "b": "two"}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1, b: "two" });
  });

  it("extracts JSON from markdown code blocks", () => {
    const result = extractJsonFromText('```json\n{"a": 1}\n```');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1 });
  });

  it("extracts JSON embedded in text", () => {
    const result = extractJsonFromText('Here is the result: {"a": 1, "b": 2}. Done.');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1, b: 2 });
  });

  it("handles arrays", () => {
    const result = extractJsonFromText('[{"a": 1}, {"a": 2}]');
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("returns failure for non-JSON text", () => {
    const result = extractJsonFromText("this is not json at all");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns failure for empty text", () => {
    const result = extractJsonFromText("");
    expect(result.success).toBe(false);
  });

  it("returns failure for null/undefined input", () => {
    expect(extractJsonFromText(null as unknown as string).success).toBe(false);
    expect(extractJsonFromText(undefined as unknown as string).success).toBe(false);
  });
});

describe("safeJsonParse", () => {
  it("returns success for valid JSON", () => {
    const result = safeJsonParse('{"cards": []}');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ cards: [] });
  });

  it("uses fallback for invalid JSON when provided", () => {
    const result = safeJsonParse("invalid", { fallback: { cards: [] } });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ cards: [] });
  });

  it("checks required fields", () => {
    const result = safeJsonParse('{"other": 1}', { requiredFields: ["cards"] });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cards");
  });

  it("passes when required fields present", () => {
    const result = safeJsonParse('{"cards": [], "extra": 1}', { requiredFields: ["cards"] });
    expect(result.success).toBe(true);
  });
});

describe("tryRepairJson", () => {
  it("removes markdown code fences", () => {
    const result = tryRepairJson("```json\n{\"a\": 1}\n```");
    expect(result).toBe("{\"a\": 1}");
  });

  it("fixes trailing commas", () => {
    const result = tryRepairJson('{"a": 1, "b": 2,}');
    expect(result).toBe('{"a": 1, "b": 2}');
  });

  it("quotes unquoted keys", () => {
    const result = tryRepairJson("{a: 1, b: 2}");
    expect(result).toBe('{"a": 1, "b": 2}');
  });

  it("returns null for unrepairable JSON", () => {
    const result = tryRepairJson("completely broken {{");
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(tryRepairJson("")).toBeNull();
  });
});
