/**
 * Sanitize internal/technical error messages into short, user-facing copy.
 *
 * Internal messages can leak provider names, API keys, model IDs, network
 * details, B2 storage info, Prisma errors, and OpenRouter/Gemini status
 * codes. UI code should always pass raw errors through `friendlyError()`
 * before showing them in a toast or alert.
 *
 * Rules:
 *   1. Never expose API providers (Gemini, OpenRouter), model names, or
 *      status codes.
 *   2. Never expose env vars, API keys, storage service names, or
 *      database errors.
 *   3. Keep messages short, actionable, and in the same voice as the rest
 *      of the app.
 *   4. Default to a generic, friendly fallback for anything unrecognized.
 */

type Domain =
  | "schedule"
  | "flashcard"
  | "syllabus"
  | "gamification"
  | "reminder"
  | "upload"
  | "save"
  | "generic";

const FALLBACK: Record<Domain, string> = {
  schedule: "We couldn't process your schedule. Please try again in a moment.",
  flashcard: "Generation failed. Please try again later.",
  syllabus: "We couldn't read this syllabus. Please try another file.",
  gamification: "Unable to save your progress. Please try again later.",
  reminder: "We couldn't set that up right now. Please try again later.",
  upload: "We couldn't upload your file. Please try again later.",
  save: "We couldn't save your changes. Please try again later.",
  generic: "Something went wrong. Please try again later.",
};

const PATTERNS: Array<{ test: RegExp; message: string }> = [
  // Daily AI/processing budget exhausted — comes back tomorrow.
  { test: /DAILY_AI_LIMIT_REACHED/i, message: "We've reached today's processing limit. Please try again tomorrow — your limit resets daily." },

  // Guest accounts get a small free allowance, then we ask them to sign up.
  { test: /GUEST_AI_LIMIT_REACHED/i, message: "You've used your free tries. Create an account to keep going — it's free." },

  // Schedule / image extraction
  { test: /AI returned data in an unrecognized format/i, message: "We couldn't process your schedule. Please try again later." },
  { test: /All AI providers failed/i, message: "We couldn't process your schedule. Please try again later." },
  { test: /Failed to fetch image/i, message: "We couldn't load your uploaded image. Please try again." },
  { test: /Preprocess failed/i, message: "We couldn't process your schedule. Please try again later." },
  { test: /OpenRouter is (currently )?disabled/i, message: "We couldn't process your schedule. Please try again later." },
  { test: /Hy3 (re-)?validation failed/i, message: "We couldn't process your schedule. Please try again later." },

  // Schedule stale
  { test: /Processing timed out/i, message: "We couldn't process your schedule. Please try again later." },

  // Schedule rate limit / generic 429
  { test: /Too many uploads/i, message: "Too many uploads. Please wait a moment and try again." },
  { test: /rate[\s-]?limit/i, message: "You've reached the limit. Please wait a moment and try again." },

  // Schedule file validation
  { test: /File too large/i, message: "Your file is too large. Please use a file under 20MB." },
  { test: /File is empty/i, message: "The uploaded file appears to be empty. Please try another." },
  { test: /must be an image/i, message: "Please upload a supported image file." },
  { test: /Unsupported file type/i, message: "Please upload a supported file." },
  { test: /Invalid upload request/i, message: "We couldn't upload that file. Please try again." },
  { test: /No file provided/i, message: "Please choose a file to upload." },

  // Auth
  { test: /Unauthorized/i, message: "Your session has expired. Please sign in again." },
  { test: /Forbidden/i, message: "You don't have permission to do that." },
  { test: /session is invalid/i, message: "Your session has expired. Please sign in again." },

  // Flashcards
  { test: /insufficient (readable )?content/i, message: "This document doesn't contain enough content to generate flashcards." },
  { test: /could not (extract|read) (readable )?text/i, message: "We couldn't read this document. Please try another file." },
  { test: /All \d+ Gemini keys failed/i, message: "Generation failed. Please try again later." },
  { test: /Max retries exceeded/i, message: "Generation failed. Please try again later." },
  { test: /No (response|JSON|valid) (from|in)/i, message: "Generation failed. Please try again later." },
  { test: /Gemini API error/i, message: "Generation failed. Please try again later." },
  { test: /no longer available/i, message: "Generation failed. Please try again later." },
  { test: /invalid argument/i, message: "Generation failed. Please try again later." },
  { test: /AI flashcard generation failed/i, message: "Generation failed. Please try again later." },

  // Generic API errors
  { test: /CSRF|Invalid request/i, message: "Your request could not be verified. Please refresh and try again." },
  { test: /Network|Failed to fetch|fetch failed|abort/i, message: "Network problem. Please check your connection and try again." },

  // Save / DB
  { test: /PrismaClient|P\d{4}|database|connection|timeout/i, message: "We couldn't reach our servers. Please try again in a moment." },

  // Username / settings
  { test: /username cannot be empty/i, message: "Username cannot be empty." },
  { test: /Username must be/i, message: "Please enter a valid username." },
  { test: /Username is already taken/i, message: "That username is already taken." },
];

export function friendlyError(raw: unknown, domain: Domain = "generic"): string {
  const message = extractMessage(raw);
  if (!message) return FALLBACK[domain];

  for (const { test, message: friendly } of PATTERNS) {
    if (test.test(message)) return friendly;
  }

  // Anything that smells like a raw provider/technical error → fallback.
  if (/(gemini|openrouter|gemma|hy3|tencent|nemotron|claude|gpt|prisma|postgres|b2|backblaze|qstash|fcm|vapid|api[_-]?key|env|\bai\b)/i.test(message)) {
    return FALLBACK[domain];
  }

  // Raw HTTP status codes, provider error codes, or numeric statuses → fallback.
  if (/\b(?:https?|error|status|code|quota|rate)[^\n]*\s?\b\d{2,3}\b|\b\d{3}\b/.test(message)) {
    return FALLBACK[domain];
  }

  // Message is already short, lowercase, and human-readable (no JSON braces,
  // no stack-trace markers, no path separators). Allow it through.
  if (
    message.length <= 140 &&
    !/[\{\}\[\]]/.test(message) &&
    !/at \w+ \(/.test(message) &&
    !/:\d+:\d+/.test(message) &&
    !/\b(?:Error|Exception):/i.test(message)
  ) {
    return message;
  }

  return FALLBACK[domain];
}

function extractMessage(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "object") {
    const obj = raw as { message?: unknown; error?: unknown };
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
  }
  return String(raw);
}
