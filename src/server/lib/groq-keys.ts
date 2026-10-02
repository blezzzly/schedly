import { USAGE_SERVICES, type UsageService } from "./usage-counter";

/**
 * Groq keys are read from `GROQ_API_KEY` (primary) plus
 * `GROQ_API_KEY_2.._10` (backups, tried in order on failure). Each free-tier
 * key has its own quota (~14,400 requests/day, 30 req/min), so multiple keys
 * from different accounts multiply the daily budget. The usage counter
 * aggregates them into a single combined total.
 */
const MAX_GROQ_KEYS = 10;

function collectGroqKeys(): string[] {
  const keys: string[] = [];
  const push = (raw: string | undefined): void => {
    const key = raw?.trim();
    if (key) keys.push(key);
  };
  push(process.env.GROQ_API_KEY);
  for (let i = 2; i <= MAX_GROQ_KEYS; i++) {
    push(process.env[`GROQ_API_KEY_${i}`]);
  }
  return keys;
}

export const GROQ_KEYS: string[] = collectGroqKeys();

/** Usage-counter service ids for each configured key, in the same order. */
export const GROQ_SERVICES: UsageService[] = GROQ_KEYS.map((_, i) => {
  const service = USAGE_SERVICES[`GROQ_${i + 1}` as keyof typeof USAGE_SERVICES];
  return service as UsageService;
});

/** Map a Groq API key back to its usage-counter service id. */
export function groqServiceFor(apiKey: string): UsageService {
  const idx = GROQ_KEYS.indexOf(apiKey);
  if (idx >= 0) return GROQ_SERVICES[idx]!;
  return USAGE_SERVICES.GROQ_1;
}
