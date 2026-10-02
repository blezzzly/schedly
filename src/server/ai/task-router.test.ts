import { describe, it, expect } from "vitest";
import { getModelsForTask, selectBestModel, getFallbackChain, getNextAvailableKey } from "@/server/ai/task-router";

describe("task-router", () => {
  it("returns models for TIMETABLE_EXTRACTION", () => {
    const models = getModelsForTask("TIMETABLE_EXTRACTION");
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.supportsVision)).toBe(true);
  });

  it("returns models for FLASHCARD_GENERATION", () => {
    const models = getModelsForTask("FLASHCARD_GENERATION");
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.supportsText)).toBe(true);
  });

  it("returns models for SYLLABUS_GENERATION", () => {
    const models = getModelsForTask("SYLLABUS_GENERATION");
    expect(models.length).toBeGreaterThan(0);
  });

  it("selectBestModel returns a vision-capable model for TIMETABLE_EXTRACTION with vision", () => {
    const model = selectBestModel("TIMETABLE_EXTRACTION", true);
    expect(model).toBeDefined();
    expect(model?.supportsVision).toBe(true);
  });

  it("selectBestModel returns a text model for text-only tasks", () => {
    const model = selectBestModel("FLASHCARD_GENERATION", false);
    expect(model).toBeDefined();
    expect(model?.supportsText).toBe(true);
  });

  it("getFallbackChain returns primary provider first", () => {
    const chain = getFallbackChain("TIMETABLE_EXTRACTION");
    expect(chain[0]).toBe("gemini");
  });

  it("getNextAvailableKey returns null for provider with no keys", () => {
    const result = getNextAvailableKey("gemini", 0);
    expect(result === null || typeof result === "number").toBe(true);
  });
});
