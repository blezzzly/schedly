import { describe, it, expect } from "vitest";
import { friendlyError } from "@/server/lib/friendly-error";

describe("friendlyError", () => {
  it("returns domain fallback for unknown error", () => {
    const result = friendlyError(new Error("Error: something bad happened here"), "generic");
    expect(result).toBe("Something went wrong. Please try again later.");
  });

  it("uses schedule fallback for schedule domain", () => {
    const result = friendlyError(new Error("All AI providers failed"), "schedule");
    expect(result).toBe("We couldn't process your schedule. Please try again later.");
  });

  it("uses flashcard fallback for flashcard domain", () => {
    const result = friendlyError(new Error("Max retries exceeded for flashcard generation"), "flashcard");
    expect(result).toBe("Generation failed. Please try again later.");
  });

  it("hides provider names from users", () => {
    const result = friendlyError(new Error("Gemini API error 500"), "generic");
    expect(result).not.toMatch(/gemini/i);
  });

  it("hides OpenRouter errors", () => {
    const result = friendlyError(new Error("OpenRouter error"), "generic");
    expect(result).not.toMatch(/openrouter/i);
  });

  it("hides environment variable references", () => {
    const result = friendlyError(new Error("API_KEY not set"), "generic");
    expect(result).not.toMatch(/api[_-]?key/i);
  });

  it("hides database errors", () => {
    const result = friendlyError(new Error("PrismaClient: P2002 constraint"), "generic");
    expect(result).not.toMatch(/prisma/i);
  });

  it("hides B2 storage references", () => {
    const result = friendlyError(new Error("B2 upload failed"), "generic");
    expect(result).not.toMatch(/b2/i);
  });

  it("returns domain-specific friendly message for 'File too large'", () => {
    const result = friendlyError(new Error("File too large (max 20MB)"), "upload");
    expect(result).toContain("20MB");
  });

  it("returns domain-specific friendly message for 'Unauthorized'", () => {
    const result = friendlyError(new Error("Unauthorized"), "generic");
    expect(result).toContain("session");
  });

  it("returns domain-specific friendly message for 'insufficient content'", () => {
    const result = friendlyError(new Error("insufficient content"), "flashcard");
    expect(result).toContain("enough content");
  });

  it("returns domain-specific friendly message for 'No file provided'", () => {
    const result = friendlyError(new Error("No file provided"), "upload");
    expect(result).toContain("choose a file");
  });

  it("returns domain-specific friendly message for 'must be an image'", () => {
    const result = friendlyError(new Error("File must be an image"), "upload");
    expect(result).toContain("supported image");
  });

  it("passes through short, human-readable messages", () => {
    const result = friendlyError(new Error("That email is invalid"), "generic");
    expect(result).toBe("That email is invalid");
  });

  it("handles string input", () => {
    const result = friendlyError("Unauthorized", "generic");
    expect(result).toContain("session");
  });

  it("handles null input", () => {
    const result = friendlyError(null, "generic");
    expect(result).toBe("Something went wrong. Please try again later.");
  });

  it("handles undefined input", () => {
    const result = friendlyError(undefined, "generic");
    expect(result).toBe("Something went wrong. Please try again later.");
  });

  it("hides stack-trace markers", () => {
    const result = friendlyError(new Error("at processTicks (file.js:123:45)"), "generic");
    expect(result).toBe("Something went wrong. Please try again later.");
  });

  it("uses reminder fallback for reminder domain", () => {
    const result = friendlyError(new Error("Exception: could not create reminder"), "reminder");
    expect(result).toBe("We couldn't set that up right now. Please try again later.");
  });
});
