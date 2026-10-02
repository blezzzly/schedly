/**
 * Flashcard generation entry point. Uses the centralized AI gateway
 * (src/server/ai/ai.service.ts) for the actual model call so retries, key
 * rotation, response parsing, and provider fallback all live in one place.
 *
 * Old direct-call path is preserved as a guard for tests, but new code should
 * call `generateFlashcards()` directly.
 */
import { generateWithFallback } from "@/server/ai/ai.service";
import { PipelineLogger } from "@/server/lib/structured-logger";

export type FlashcardGenerationResult = {
  cards: Array<{ question: string; answer: string }>;
};

const FLASHCARD_BASE_PROMPT = `You are an expert flashcard creator for students. Generate high-quality flashcards from the provided study material.

Rules:
1. Questions must be based ONLY on the uploaded study material. Do NOT invent facts not in the source.
2. Avoid duplicate questions.
3. Keep questions clear, concise, and study-friendly.
4. Answers should be concise but sufficient for studying (max 500 chars).
5. Prioritize important concepts, definitions, processes, formulas, examples, and facts.
6. If a topic is provided, focus primarily on that topic.
7. Generate the requested number of cards when enough source material exists.
8. If there is not enough information, generate fewer cards rather than hallucinating.

Return ONLY valid JSON:
{"cards": [{"question": "...", "answer": "..."}]}`;

const FLASHCARD_TOPIC_PROMPT = FLASHCARD_BASE_PROMPT.replace(
  "6. If a topic is provided, focus primarily on that topic.",
  "6. Focus PRIMARILY on the given topic. Only include other content if directly relevant.",
);

const MAX_INPUT_CHARS = 25_000;

function buildPrompt(topic: string | undefined, cardCount: number): string {
  const base = topic ? FLASHCARD_TOPIC_PROMPT : FLASHCARD_BASE_PROMPT;
  return `${base}\n\nGenerate ${cardCount} flashcards.`;
}

function normalizeCards(raw: Record<string, unknown>): FlashcardGenerationResult {
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  const normalized = cards
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      question: typeof c.question === "string" ? c.question.trim() : "",
      answer: typeof c.answer === "string" ? c.answer.trim().slice(0, 500) : "",
    }))
    .filter((c) => c.question.length > 0 && c.answer.length > 0);

  const seen = new Set<string>();
  const deduped = normalized.filter((c) => {
    const key = c.question.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { cards: deduped };
}

/**
 * Generate flashcards from extracted text content (e.g. PDF text).
 * Truncates the input to the model context window to keep token usage low.
 */
export async function generateFlashcards(
  textContent: string,
  cardCount: number,
  topic?: string,
): Promise<FlashcardGenerationResult> {
  if (!textContent || textContent.trim().length < 50) {
    throw new Error("Document contains insufficient content for flashcard generation");
  }

  const truncated = textContent.slice(0, MAX_INPUT_CHARS);
  const prompt = buildPrompt(topic, cardCount);

  const result = await generateWithFallback(
    "FLASHCARD_GENERATION",
    { text: truncated },
    { temperature: 0.2, maxTokens: 8192, prompt },
  );

  if (!result.success || !result.data) {
    PipelineLogger.warn("flashcard", "AI gateway returned no result", { provider: result.provider });
    throw new Error("Flashcard generation failed. Please try again later.");
  }

  return normalizeCards(result.data);
}

/**
 * Generate flashcards from an image (base64). Routes through the AI gateway
 * with vision-capable fallback chain (Gemini → OpenRouter).
 */
export async function generateFlashcardsFromImage(
  base64Data: string,
  mimeType: string,
  cardCount: number,
  topic?: string,
): Promise<FlashcardGenerationResult> {
  const prompt = buildPrompt(topic, cardCount);

  const result = await generateWithFallback(
    "FLASHCARD_GENERATION",
    { image: { base64: base64Data, mimeType } },
    { temperature: 0.2, maxTokens: 8192, prompt },
  );

  if (!result.success || !result.data) {
    throw new Error("Flashcard generation failed. Please try again later.");
  }

  return normalizeCards(result.data);
}
