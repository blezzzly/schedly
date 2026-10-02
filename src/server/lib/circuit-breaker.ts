/**
 * Provider-aware circuit breakers. Each provider gets its own breaker so a
 * single exhausted key/provider does NOT block the others. The breaker trips
 * after N consecutive failures within a window and auto-resets after a
 * configurable cooldown. The same provider on the same serverless instance
 * shares the breaker state — serverless cold starts reset the breaker, which
 * is acceptable (worst case: one extra request, no quota harm).
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const DEFAULT_CONFIG = {
  threshold: 10,
  resetTimeout: 60_000,
  halfOpenAttempts: 2,
};

const PROVIDER_CONFIG: Record<string, Partial<typeof DEFAULT_CONFIG>> = {
  gemini: { threshold: 10, resetTimeout: 60_000, halfOpenAttempts: 2 },
  openrouter: { threshold: 5, resetTimeout: 120_000, halfOpenAttempts: 1 },
  groq: { threshold: 8, resetTimeout: 60_000, halfOpenAttempts: 2 },
  bytez: { threshold: 5, resetTimeout: 120_000, halfOpenAttempts: 1 },
  openai: { threshold: 5, resetTimeout: 60_000, halfOpenAttempts: 1 },
};

export function getCircuitBreaker(name: string, configOverride?: Partial<typeof DEFAULT_CONFIG>) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, {
      failures: 0,
      lastFailure: 0,
      state: "CLOSED",
    });
  }

  const config = { ...DEFAULT_CONFIG, ...(PROVIDER_CONFIG[name] ?? {}), ...(configOverride ?? {}) };
  const cb = circuitBreakers.get(name)!;

  function isOpen(): boolean {
    if (cb.state === "OPEN") {
      const now = Date.now();
      if (now - cb.lastFailure >= config.resetTimeout) {
        cb.state = "HALF_OPEN";
        cb.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  function recordSuccess(): void {
    cb.failures = 0;
    cb.state = "CLOSED";
  }

  function recordFailure(): void {
    cb.failures++;
    cb.lastFailure = Date.now();
    if (cb.failures >= config.threshold) {
      cb.state = "OPEN";
      console.log(`[CIRCUIT_BREAKER] ${name} opened after ${cb.failures} failures`);
    }
  }

  function getStatus() {
    return {
      name,
      state: cb.state,
      failures: cb.failures,
      lastFailure: new Date(cb.lastFailure).toISOString(),
    };
  }

  function canExecute(): boolean {
    if (cb.state === "CLOSED") return true;
    if (cb.state === "HALF_OPEN") {
      return cb.failures < config.halfOpenAttempts;
    }
    return false;
  }

  return {
    isOpen,
    recordSuccess,
    recordFailure,
    getStatus,
    canExecute,
  };
}

/* Provider-level breakers — used by the legacy direct-call paths and the
 * flashcard worker. The newer per-key breakers live in
 * src/server/ai/circuit-breaker.ts and are used by the centralized AI
 * gateway. */
export const geminiCircuitBreaker = getCircuitBreaker("gemini");
export const openaiCircuitBreaker = getCircuitBreaker("openai");
export const openrouterCircuitBreaker = getCircuitBreaker("openrouter");
export const groqCircuitBreaker = getCircuitBreaker("groq");
export const bytezCircuitBreaker = getCircuitBreaker("bytez");
