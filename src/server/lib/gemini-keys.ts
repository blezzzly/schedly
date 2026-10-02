import { USAGE_SERVICES, type UsageService } from "./usage-counter";

/**
 * Google AI Studio (Gemini) keys are read from `GEMINI_API_KEY` (primary) plus
 * `GEMINI_API_KEY_2.._10` (backups, tried in order on failure). Each free-tier
 * key carries its own generous daily quota (~1,500 requests/day), so multiple
 * keys multiply the daily budget. The usage counter and limits dashboard
 * aggregate them into a single combined total.
 */
const MAX_GEMINI_KEYS = 10;

function collectGeminiKeys(): string[] {
  const keys: string[] = [];
  const push = (raw: string | undefined): void => {
    const key = raw?.trim();
    if (key) keys.push(key);
  };
  push(process.env.GEMINI_API_KEY);
  for (let i = 2; i <= MAX_GEMINI_KEYS; i++) {
    push(process.env[`GEMINI_API_KEY_${i}`]);
  }
  return keys;
}

export const GEMINI_KEYS: string[] = collectGeminiKeys();

/** Usage-counter service ids for each configured key, in the same order. */
export const GEMINI_SERVICES: UsageService[] = GEMINI_KEYS.map((_, i) => {
  const service = USAGE_SERVICES[`GEMINI_${i + 1}` as keyof typeof USAGE_SERVICES];
  return service as UsageService;
});

/** Map a Gemini API key back to its usage-counter service id. */
export function geminiServiceFor(apiKey: string): UsageService {
  const idx = GEMINI_KEYS.indexOf(apiKey);
  if (idx >= 0) return GEMINI_SERVICES[idx]!;
  return USAGE_SERVICES.GEMINI_1;
}
