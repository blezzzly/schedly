import { OPENROUTER_KEYS, openRouterServiceFor, isOpenRouterEnabled } from "./openrouter-keys";
import { incrementUsage } from "./usage-counter";
import { geminiCircuitBreaker, openaiCircuitBreaker } from "./circuit-breaker";
import type { FlashcardGenerationResult } from "./flashcard-extract";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(status: number): boolean {
  return status === 503 || status === 429 || status === 502 || status === 504;
}

async function callOpenRouterFlashcard(
  userMessage: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: "You are an expert flashcard creator for students. Return ONLY valid JSON." },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });

  void incrementUsage(openRouterServiceFor(apiKey));

  const bodyText = await response.text();
  let data: unknown;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new Error(`OpenRouter returned non-JSON (status ${response.status})`);
  }

  if (!response.ok) {
    const status = response.status;
    const msg = (data as { error?: { message?: string } })?.error?.message || "Unknown";
    throw new Error(`OpenRouter API error: ${status} - ${msg}`);
  }

  const text = (data as { choices?: { message?: { content?: string } }[] })
    .choices?.[0]?.message?.content;
  if (!text) throw new Error("No response from OpenRouter");

  return text;
}

export async function generateFlashcardsViaOpenRouter(
  prompt: string,
): Promise<FlashcardGenerationResult> {
  if (openaiCircuitBreaker.isOpen()) {
    throw new Error("OpenRouter circuit breaker is open");
  }

  if (!(await isOpenRouterEnabled())) {
    throw new Error("OpenRouter is currently disabled");
  }

  const errors: Error[] = [];

  for (const apiKey of OPENROUTER_KEYS) {
    try {
      const text = await callOpenRouterFlashcard(prompt, apiKey);
      openaiCircuitBreaker.recordSuccess();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const cards = Array.isArray(raw.cards) ? raw.cards : [];
      const normalizedCards = cards
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map((c) => ({
          question: typeof c.question === "string" ? c.question.trim() : "",
          answer: typeof c.answer === "string" ? c.answer.trim() : "",
        }))
        .filter((c) => c.question.length > 0 && c.answer.length > 0);

      const seen = new Set<string>();
      const deduped = normalizedCards.filter((c) => {
        const key = c.question.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { cards: deduped };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push(error);
      console.error(`[FLASHCARD_OPENROUTER] Key failed:`, error.message);

      if (error.message && isRetryableError(parseInt(error.message.match(/\d{3}/)?.[0] || "0"))) {
        openaiCircuitBreaker.recordFailure();
      }

      await sleep(2000);
    }
  }

  const lastError = errors[errors.length - 1];
  throw new Error(`All ${OPENROUTER_KEYS.length} OpenRouter keys failed. Last error: ${lastError?.message}`);
}
