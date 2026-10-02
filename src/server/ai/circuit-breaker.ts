import type { ProviderId, ProviderKey, ProviderHealth, ProviderStatus } from "./types";
import { GEMINI_KEYS } from "@/server/lib/gemini-keys";
import { GROQ_KEYS } from "@/server/lib/groq-keys";
import { OPENROUTER_KEYS } from "@/server/lib/openrouter-keys";
import { BYTEZ_KEYS } from "@/server/lib/bytez-keys";
import { PipelineLogger } from "@/server/lib/structured-logger";

export interface CircuitBreakerConfig {
  threshold: number;
  resetTimeout: number;
  halfOpenAttempts: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  threshold: 5,
  resetTimeout: 60_000,
  halfOpenAttempts: 3,
};

interface KeyState {
  failures: number;
  lastFailure: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  cooldownUntil: number | null;
}

const keyStates = new Map<string, Map<number, KeyState>>();

function getKeyState(provider: string): Map<number, KeyState> {
  if (!keyStates.has(provider)) {
    keyStates.set(provider, new Map());
  }
  return keyStates.get(provider)!;
}

function getOrCreateKeyState(provider: string, keyIndex: number, config: CircuitBreakerConfig): KeyState {
  const states = getKeyState(provider);
  if (!states.has(keyIndex)) {
    states.set(keyIndex, {
      failures: 0,
      lastFailure: 0,
      state: "CLOSED",
      cooldownUntil: null,
    });
  }
  return states.get(keyIndex)!;
}

function isOpen(state: KeyState, config: CircuitBreakerConfig): boolean {
  if (state.state === "OPEN") {
    const now = Date.now();
    if (state.cooldownUntil && now >= state.cooldownUntil) {
      state.state = "HALF_OPEN";
      state.failures = 0;
      state.cooldownUntil = null;
      return false;
    }
    return true;
  }
  return false;
}

export function recordSuccess(provider: string, keyIndex: number): void {
  const state = getOrCreateKeyState(provider, keyIndex, DEFAULT_CONFIG);
  state.failures = 0;
  state.state = "CLOSED";
  state.cooldownUntil = null;
}

export function recordFailure(provider: string, keyIndex: number): void {
  const state = getOrCreateKeyState(provider, keyIndex, DEFAULT_CONFIG);
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= DEFAULT_CONFIG.threshold) {
    state.state = "OPEN";
    state.cooldownUntil = Date.now() + DEFAULT_CONFIG.resetTimeout;
    PipelineLogger.warn("circuit-breaker", `${provider} key ${keyIndex + 1} opened after ${state.failures} failures`);
  }
}

export function isKeyAvailable(provider: string, keyIndex: number): boolean {
  const state = getOrCreateKeyState(provider, keyIndex, DEFAULT_CONFIG);
  if (state.state === "CLOSED") return true;
  if (state.state === "HALF_OPEN") {
    return state.failures < DEFAULT_CONFIG.halfOpenAttempts;
  }
  return !isOpen(state, DEFAULT_CONFIG);
}

export function getHealth(provider: string, keyIndex: number): ProviderHealth {
  const state = getOrCreateKeyState(provider, keyIndex, DEFAULT_CONFIG);
  if (state.state === "OPEN") {
    const now = Date.now();
    if (state.cooldownUntil && now < state.cooldownUntil) {
      return "QUOTA_EXHAUSTED";
    }
    return "DEGRADED";
  }
  if (state.state === "HALF_OPEN") return "DEGRADED";
  return "HEALTHY";
}

export function getProviderStatus(providerId: ProviderId): ProviderStatus {
  const keyCount = getKeyCount(providerId);
  const keys: ProviderKey[] = [];
  let healthyCount = 0;

  for (let i = 0; i < keyCount; i++) {
    const health = getHealth(providerId, i);
    const state = getOrCreateKeyState(providerId, i, DEFAULT_CONFIG);
    keys.push({
      id: `${providerId}_${i + 1}`,
      index: i,
      health,
      lastSuccess: state.state === "CLOSED" && state.failures === 0 ? state.lastFailure : null,
      lastFailure: state.lastFailure || null,
      cooldownUntil: state.cooldownUntil,
      failureCount: state.failures,
    });
    if (health === "HEALTHY") healthyCount++;
  }

  return {
    id: providerId,
    name: PROVIDER_NAMES[providerId],
    health: healthyCount === 0 ? "DISABLED" : healthyCount < keyCount ? "DEGRADED" : "HEALTHY",
    keys,
    isAvailable: healthyCount > 0,
  };
}

export function getAllProviderStatuses(): ProviderStatus[] {
  return (["gemini", "groq", "openrouter", "bytez"] as ProviderId[]).map(getProviderStatus);
}

function getKeyCount(provider: ProviderId): number {
  switch (provider) {
    case "gemini": return GEMINI_KEYS.length;
    case "groq": return GROQ_KEYS.length;
    case "openrouter": return OPENROUTER_KEYS.length;
    case "bytez": return BYTEZ_KEYS.length;
  }
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  bytez: "Bytez",
};
