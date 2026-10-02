import { getLimitSnapshots, USAGE_SERVICES, type UsageService } from "./usage-counter";

/**
 * OpenRouter keys are read from `OPENROUTER_API_KEY` (primary) plus
 * `OPENROUTER_API_KEY_2.._10` (backups, tried in order on failure). Each key
 * carries its own ~50 free-requests/day cap, so multiple keys multiply the
 * daily budget. The usage counter and limits dashboard aggregate them into a
 * single combined total.
 */
const MAX_OPENROUTER_KEYS = 10;

function collectOpenRouterKeys(): string[] {
  const keys: string[] = [];
  const push = (raw: string | undefined): void => {
    const key = raw?.trim();
    if (key) keys.push(key);
  };
  push(process.env.OPENROUTER_API_KEY);
  for (let i = 2; i <= MAX_OPENROUTER_KEYS; i++) {
    push(process.env[`OPENROUTER_API_KEY_${i}`]);
  }
  return keys;
}

export const OPENROUTER_KEYS: string[] = collectOpenRouterKeys();

/** Usage-counter service ids for each configured key, in the same order. */
export const OPENROUTER_SERVICES: UsageService[] = OPENROUTER_KEYS.map((_, i) => {
  const service = USAGE_SERVICES[`OPENROUTER_${i + 1}` as keyof typeof USAGE_SERVICES];
  return service as UsageService;
});

/** Map an OpenRouter key back to its usage-counter service id. */
export function openRouterServiceFor(apiKey: string): UsageService {
  const idx = OPENROUTER_KEYS.indexOf(apiKey);
  if (idx >= 0) return OPENROUTER_SERVICES[idx]!;
  return USAGE_SERVICES.OPENROUTER_1;
}

/** OpenRouter free-model daily limits reset at midnight UTC. */
function nextUtcMidnight(from: Date): Date {
  const d = new Date(from);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

/**
 * Whether OpenRouter keys may be used right now.
 *
 * OpenRouter is skipped (auto-rested) when we know its free-model daily budget
 * is exhausted. Two signals disable it:
 *   1. `OPENROUTER_DISABLED=true` — a manual hard skip until the next daily
 *      provider reset (midnight UTC).
 *   2. A persisted provider rate-limit snapshot showing `remaining <= 0` with
 *      a reset still in the future — i.e. OpenRouter itself told us its free
 *      tier is used up (429). We record that on the fly and rest the quota
 *      automatically instead of trying exhausted keys on every request.
 *
 * Once the reset passes we come back online automatically.
 */
export async function isOpenRouterEnabled(now = new Date()): Promise<boolean> {
  if (process.env.OPENROUTER_DISABLED === "true") {
    return nowIsAfterProviderReset(now);
  }

  const snapshots = await getLimitSnapshots();
  for (const service of OPENROUTER_SERVICES) {
    const snap = snapshots[service];
    if (!snap) continue;
    const remainingExhausted = snap.remaining != null && snap.remaining <= 0;
    const notYetReset = snap.resetAt != null && snap.resetAt.getTime() > now.getTime();
    if (remainingExhausted && notYetReset) {
      return false;
    }
  }
  return true;
}

async function nowIsAfterProviderReset(now: Date): Promise<boolean> {
  const snapshots = await getLimitSnapshots();
  let providerReset: Date | null = null;
  for (const service of OPENROUTER_SERVICES) {
    const resetAt = snapshots[service]?.resetAt;
    if (resetAt && resetAt.getTime() > now.getTime()) {
      if (!providerReset || resetAt.getTime() < providerReset.getTime()) {
        providerReset = resetAt;
      }
    }
  }
  const reset = providerReset ?? nextUtcMidnight(now);
  return now.getTime() >= reset.getTime();
}
