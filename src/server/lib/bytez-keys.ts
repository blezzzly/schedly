import { USAGE_SERVICES, type UsageService } from "./usage-counter";

/**
 * Bytez keys are read from `BYTEZ_API_KEY` (primary) plus
 * `BYTEZ_API_KEY_2.._10` (backups, tried in order on failure). Bytez is a
 * unified API for 221,000+ open-source models (vision + text). Free tier: $1
 * credits/month, open models up to 7B params.
 * Docs: https://docs.bytez.com
 * Key format: raw key (no prefix), passed as `Bearer {key}` in header.
 * Endpoint: POST https://api.bytez.com/models/v2/{modelId}
 */
const MAX_BYTEZ_KEYS = 10;

function collectBytezKeys(): string[] {
  const keys: string[] = [];
  const push = (raw: string | undefined): void => {
    const key = raw?.trim();
    if (key) keys.push(key);
  };
  push(process.env.BYTEZ_API_KEY);
  for (let i = 2; i <= MAX_BYTEZ_KEYS; i++) {
    push(process.env[`BYTEZ_API_KEY_${i}`]);
  }
  return keys;
}

export const BYTEZ_KEYS: string[] = collectBytezKeys();

/** Usage-counter service ids for each configured key, in the same order. */
export const BYTEZ_SERVICES: UsageService[] = BYTEZ_KEYS.map((_, i) => {
  const service = USAGE_SERVICES[`BYTEZ_${i + 1}` as keyof typeof USAGE_SERVICES];
  return service as UsageService;
});

/** Map a Bytez API key back to its usage-counter service id. */
export function bytezServiceFor(apiKey: string): UsageService {
  const idx = BYTEZ_KEYS.indexOf(apiKey);
  if (idx >= 0) return BYTEZ_SERVICES[idx]!;
  return USAGE_SERVICES.BYTEZ_1;
}
