import type { TaskType, AiResponse, ProviderId } from "./types";
import { PipelineLogger } from "@/server/lib/structured-logger";
import { withRetry, categorizeError } from "./retry-manager";
import { safeJsonParse } from "./response-parser";
import { GEMINI_KEYS, GEMINI_SERVICES, geminiServiceFor } from "@/server/lib/gemini-keys";
import { GROQ_KEYS, GROQ_SERVICES, groqServiceFor } from "@/server/lib/groq-keys";
import { OPENROUTER_KEYS, openRouterServiceFor, isOpenRouterEnabled } from "@/server/lib/openrouter-keys";
import { BYTEZ_KEYS, bytezServiceFor } from "@/server/lib/bytez-keys";
import { incrementUsage } from "@/server/lib/usage-counter";
import { getUsage, todayKey, saveLimitSnapshot } from "@/server/lib/usage-counter";
import { getFallbackChain, markFailure, markSuccess } from "./task-router";

const SCHEDULE_EXTRACTION_PROMPT = `Treat the uploaded image as a structured class schedule. Analyze the complete table layout first, then extract only valid class entries.

UNIQUE KEY: a class is (subject + room + startTime + endTime). If the same class meets on multiple days with identical room and time, MERGE the days into one record's days array — never create duplicate records.

Parse day tokens in ANY format (M, T, W, TH, F, SAT, SUN, MW, TF, TTH, MWF, etc.) and return them as raw tokens (e.g. ["MWF"], ["TTH"]). Do NOT expand to full names.

For each class extract: subject, courseCode, instructor, room, section, block, notes, days (array of raw day tokens), startTime/endTime in 24-hour "HH:MM".

Rules:
- 24-hour "HH:MM" time only
- READ TIMES EXACTLY AS PRINTED. Do NOT round or estimate.
- If time is faint, output your best exact reading — never leave blank.
- days is always an ARRAY
- Unseen fields -> null
- Ignore duplicate OCR text, headers, decorative elements
- If not a schedule -> {"semester": null, "classes": [], "metadata": {"totalClasses": 0, "confidence": 0, "notes": "not_a_schedule"}}

Return ONLY valid JSON:
{"semester": "1st Semester 2026", "classes": [{"subject": "Programming 2", "courseCode": "CS102", "days": ["MW"], "startTime": "07:30", "endTime": "09:00", "room": "Lab 301", "instructor": "Prof. Santos", "section": "BSCS-1A", "block": "BSCS-1A", "notes": null}], "metadata": {"totalClasses": 1, "confidence": 0.95, "notes": null}}`;

const FLASHCARD_PROMPT = `Generate flashcards from the study material. Questions based ONLY on the source. Return ONLY valid JSON: {"cards": [{"question": "...", "answer": "..."}]}. Max 500 chars per answer.`;

const SYLLABUS_PROMPT = `Extract syllabus information from the provided content. Return ONLY valid JSON with course info and requirements. Never invent information. Return null for missing fields.`;

/**
 * Daily combined AI budget across the text-capable providers (Gemini + Groq).
 * Each configured key carries its own free-tier request cap. When the combined
 * usage for today reaches the total, the gateway refuses new requests with a
 * recognisable sentinel so callers can tell the user to come back tomorrow
 * (instead of showing a confusing "all keys failed" error).
 */
const GEMINI_LIMIT_PER_KEY = 1500;
const GROQ_LIMIT_PER_KEY = 14_400;

async function isDailyAiBudgetExhausted(): Promise<boolean> {
  try {
    const rows = await getUsage(todayKey());
    const byService = new Map(rows.map((r) => [r.service, r.count]));
    let used = 0;
    for (const svc of GEMINI_SERVICES) used += byService.get(svc) ?? 0;
    for (const svc of GROQ_SERVICES) used += byService.get(svc) ?? 0;
    const total =
      GEMINI_KEYS.length * GEMINI_LIMIT_PER_KEY +
      GROQ_KEYS.length * GROQ_LIMIT_PER_KEY;
    return used >= total;
  } catch {
    // Never block an upload because a counter read failed.
    return false;
  }
}

/** Thrown when today's combined AI budget is used up. Callers route it through
 *  `friendlyError`, which maps it to a "try again tomorrow" message. */
export class AiDailyLimitError extends Error {
  constructor() {
    super("DAILY_AI_LIMIT_REACHED");
    this.name = "AiDailyLimitError";
  }
}

/**
 * Charge the caller's guest AI allowance, if they are a guest.
 *
 * Resolved per-request from the session cookie so this single choke point
 * covers every AI task. Any failure to identify the caller is swallowed: a
 * background worker, a script, or a session lookup hiccup must never be able
 * to break a real user's upload.
 */
async function meterGuestAi(): Promise<void> {
  try {
    // Order matters: `headers()` first, because it's the cheap check that
    // fails outside a request scope (background workers, scripts, tests). That
    // way we never pay for constructing the auth instance when there's no
    // request to attribute the call to.
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();

    const { auth } = await import("@/server/lib/auth");
    const { consumeGuestAiAllowance } = await import("@/server/lib/guest");

    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user?.id) return;

    await consumeGuestAiAllowance(session.user.id);
  } catch (err) {
    // Re-throw the guest limit so the user gets the "create an account" copy;
    // swallow everything else (no request scope, DB blip, etc.).
    if (err instanceof Error && err.name === "GuestAiLimitError") throw err;
  }
}

export async function generateWithFallback(
  task: TaskType,
  input: { image?: { base64: string; mimeType: string }; text?: string; json?: Record<string, unknown> },
  opts: { temperature?: number; maxTokens?: number; prompt?: string } = {},
): Promise<AiResponse> {
  const t0 = performance.now();

  if (await isDailyAiBudgetExhausted()) {
    throw new AiDailyLimitError();
  }

  // Guest accounts get a small free allowance. Enforced here rather than in
  // each caller so no AI path can bypass it by accident. Fail-open if we can't
  // identify the caller (e.g. no request scope, background worker).
  await meterGuestAi();

  const providers = getFallbackChain(task);

  for (const provider of providers) {
    try {
      const result = await withRetry(
        () => callProvider(provider, task, input, opts),
        { operationName: `${task}/${provider}` },
      );

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data,
          provider,
          usedFallback: providers.indexOf(provider) > 0,
          latencyMs: Math.round(performance.now() - t0),
        };
      }

      if (!result.success) {
        PipelineLogger.warn("ai-gateway", `${task} failed on ${provider}`, { error: result.error });
        markFailure(provider, 0);
      }
    } catch (err) {
      const categorized = categorizeError(err);
      PipelineLogger.warn("ai-gateway", `${task}/${provider} threw`, { category: categorized.category, error: err instanceof Error ? err.message : String(err) });

      if (!categorized.retryable) {
        markFailure(provider, 0);
      }
    }
  }

  return {
    success: false,
    error: `All AI providers failed for task: ${task}`,
  };
}

async function callProvider(
  provider: ProviderId,
  task: TaskType,
  input: { image?: { base64: string; mimeType: string }; text?: string; json?: Record<string, unknown> },
  opts: { temperature?: number; maxTokens?: number; prompt?: string },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  switch (provider) {
    case "gemini": return callGemini(task, input, opts);
    case "groq": return callGroq(task, input, opts);
    case "openrouter": return callOpenRouter(task, input, opts);
    case "bytez": return callBytez(task, input, opts);
  }
}

async function callGemini(
  task: TaskType,
  input: { image?: { base64: string; mimeType: string }; text?: string; json?: Record<string, unknown> },
  opts: { temperature?: number; maxTokens?: number; prompt?: string },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  if (GEMINI_KEYS.length === 0) return { success: false, error: "No Gemini keys configured" };

  const prompt = opts.prompt ?? getPromptForTask(task);
  const temperature = opts.temperature ?? 0.1;
  const maxTokens = opts.maxTokens ?? 8192;

  for (const apiKey of GEMINI_KEYS) {
    try {
      const parts: Record<string, unknown>[] = [];
      if (input.image) {
        parts.push({ inline_data: { mime_type: input.image.mimeType, data: input.image.base64 } });
      }
      if (input.text) {
        parts.push({ text: input.text });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: prompt }] },
            contents: [{ role: "user", parts }],
            generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      void incrementUsage(geminiServiceFor(apiKey));

      if (!response.ok) {
        const body = await response.text().catch(() => "{}");
        const data = JSON.parse(body) as { error?: { message?: string } };
        throw new Error(`Gemini ${response.status}: ${data.error?.message ?? response.statusText}`);
      }

      const body = await response.text();
      const parsed = JSON.parse(body) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) return { success: false, error: "No response text from Gemini" };

      const { success, data, error } = safeJsonParse(text, {
        requiredFields: task === "FLASHCARD_GENERATION" ? ["cards"] : undefined,
      });

      if (success && data) {
        markSuccess("gemini", GEMINI_KEYS.indexOf(apiKey));
        return { success: true, data };
      }
      return { success: false, error: error ?? "Failed to parse Gemini response" };
    } catch (err) {
      const categorized = categorizeError(err);
      if (categorized.category === "quota" || categorized.category === "auth") {
        throw err;
      }
      PipelineLogger.debug("gemini", `Key failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: false, error: "All Gemini keys failed" };
}

async function callGroq(
  task: TaskType,
  input: { image?: { base64: string; mimeType: string }; text?: string; json?: Record<string, unknown> },
  opts: { temperature?: number; maxTokens?: number; prompt?: string },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  if (GROQ_KEYS.length === 0) return { success: false, error: "No Groq keys configured" };

  const prompt = opts.prompt ?? getPromptForTask(task);
  const temperature = opts.temperature ?? 0.1;
  const maxTokens = opts.maxTokens ?? 8192;

  for (const apiKey of GROQ_KEYS) {
    try {
      const messages: { role: string; content: string }[] = [{ role: "user", content: input.text ?? prompt }];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      void incrementUsage(groqServiceFor(apiKey));

      if (!response.ok) {
        const body = await response.text().catch(() => "{}");
        const data = JSON.parse(body) as { error?: { message?: string } };
        throw new Error(`Groq ${response.status}: ${data.error?.message ?? response.statusText}`);
      }

      const body = await response.text();
      const parsed = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
      const text = parsed.choices?.[0]?.message?.content;

      if (!text) return { success: false, error: "No response from Groq" };

      const { success, data, error } = safeJsonParse(text);
      if (success && data) {
        markSuccess("groq", GROQ_KEYS.indexOf(apiKey));
        return { success: true, data };
      }
      return { success: false, error: error ?? "Failed to parse Groq response" };
    } catch (err) {
      PipelineLogger.debug("groq", `Key failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: false, error: "All Groq keys failed" };
}

async function callOpenRouter(
  task: TaskType,
  input: { image?: { base64: string; mimeType: string }; text?: string; json?: Record<string, unknown> },
  opts: { temperature?: number; maxTokens?: number; prompt?: string },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  if (OPENROUTER_KEYS.length === 0) return { success: false, error: "No OpenRouter keys configured" };
  if (!(await isOpenRouterEnabled())) return { success: false, error: "OpenRouter disabled (waiting for quota reset)" };

  const prompt = opts.prompt ?? getPromptForTask(task);
  const temperature = opts.temperature ?? 0.1;
  const maxTokens = opts.maxTokens ?? 2048;

  for (const apiKey of OPENROUTER_KEYS) {
    try {
      let content: { type: string; text?: string; image_url?: { url: string } }[];

      if (input.image) {
        content = [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${input.image.mimeType};base64,${input.image.base64}` } },
        ];
      } else {
        content = [{ type: "text", text: input.text ? `${prompt}\n\n${input.text}` : prompt }];
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Schedly",
        },
        body: JSON.stringify({ model: "google/gemma-4-26b-a4b-it:free", messages: [{ role: "user", content }], temperature, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      void incrementUsage(openRouterServiceFor(apiKey));

      if (!response.ok) {
        const body = await response.text().catch(() => "{}");
        const data = JSON.parse(body) as { error?: { message?: string } };

        // OpenRouter free-model rate limits arrive via response headers. Persist
        // them so `isOpenRouterEnabled` can auto-rest the quota until reset
        // instead of trying exhausted keys on every request.
        if (response.status === 429) {
          const rm = response.headers.get("x-ratelimit-remaining");
          const lmt = response.headers.get("x-ratelimit-limit");
          const rst = response.headers.get("x-ratelimit-reset");
          if (rm != null || lmt != null || rst != null) {
            void saveLimitSnapshot(openRouterServiceFor(apiKey), {
              remaining: rm != null ? Number(rm) : null,
              limit: lmt != null ? Number(lmt) : null,
              resetAt: rst,
            });
          }
        }

        throw new Error(`OpenRouter ${response.status}: ${data.error?.message ?? response.statusText}`);
      }

      const body = await response.text();
      const parsed = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
      const text = parsed.choices?.[0]?.message?.content;

      if (!text) return { success: false, error: "No response from OpenRouter" };

      const { success, data, error } = safeJsonParse(text);
      if (success && data) {
        markSuccess("openrouter", OPENROUTER_KEYS.indexOf(apiKey));
        return { success: true, data };
      }
      return { success: false, error: error ?? "Failed to parse OpenRouter response" };
    } catch (err) {
      PipelineLogger.debug("openrouter", `Key failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: false, error: "All OpenRouter keys failed" };
}

async function callBytez(
  task: TaskType,
  input: { image?: { base64: string; mimeType: string }; text?: string; json?: Record<string, unknown> },
  opts: { temperature?: number; maxTokens?: number; prompt?: string },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  if (BYTEZ_KEYS.length === 0) return { success: false, error: "No Bytez keys configured" };

  for (const apiKey of BYTEZ_KEYS) {
    try {
      const messages: { role: string; content: string }[] = [];
      if (input.image) {
        messages.push({ role: "user", content: `[IMAGE: ${input.image.mimeType}]\n${opts.prompt ?? getPromptForTask(task)}` });
      } else {
        messages.push({ role: "user", content: input.text ?? opts.prompt ?? getPromptForTask(task) });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(`https://api.bytez.com/models/v2/google/gemma-3-4b-it`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages, params: { temperature: opts.temperature ?? 0.1, max_new_tokens: opts.maxTokens ?? 8192 } }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      void incrementUsage(bytezServiceFor(apiKey));

      if (!response.ok) {
        const body = await response.text().catch(() => "{}");
        const data = JSON.parse(body) as { error?: string };
        throw new Error(`Bytez ${response.status}: ${data.error ?? response.statusText}`);
      }

      const body = await response.text();
      const parsed = JSON.parse(body) as { output?: unknown; error?: string | null };

      if (parsed.error) return { success: false, error: String(parsed.error) };
      const text = typeof parsed.output === "string" ? parsed.output : JSON.stringify(parsed.output);
      const { success, data, error } = safeJsonParse(text);

      if (success && data) {
        markSuccess("bytez", BYTEZ_KEYS.indexOf(apiKey));
        return { success: true, data };
      }
      return { success: false, error: error ?? "Failed to parse Bytez response" };
    } catch (err) {
      PipelineLogger.debug("bytez", `Key failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: false, error: "All Bytez keys failed" };
}

function getPromptForTask(task: TaskType): string {
  switch (task) {
    case "TIMETABLE_EXTRACTION": return SCHEDULE_EXTRACTION_PROMPT;
    case "FLASHCARD_GENERATION": return FLASHCARD_PROMPT;
    case "SYLLABUS_GENERATION": return SYLLABUS_PROMPT;
    case "SCHEDULE_VALIDATION": return "Validate this schedule JSON. Return ONLY valid JSON with same schema plus overallConfidence field.";
    case "SCHEDULE_SUGGESTIONS": return "Give 3-5 short study/life tips for this schedule. Return ONLY valid JSON: {\"suggestions\": [\"...\"]}. Max 25 words each. Talk naturally, like a friend.";
    default: return "Process the following content and return ONLY valid JSON.";
  }
}
