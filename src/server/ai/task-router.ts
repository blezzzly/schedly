import type { TaskType, ProviderId } from "./types";
import { isKeyAvailable, recordSuccess, recordFailure } from "./circuit-breaker";
import { PipelineLogger } from "@/server/lib/structured-logger";
import { GEMINI_KEYS } from "@/server/lib/gemini-keys";
import { GROQ_KEYS } from "@/server/lib/groq-keys";
import { OPENROUTER_KEYS } from "@/server/lib/openrouter-keys";
import { BYTEZ_KEYS } from "@/server/lib/bytez-keys";

export interface ModelInfo {
  model: string;
  provider: ProviderId;
  keyIndex: number;
  supportsVision: boolean;
  supportsText: boolean;
  priority: number;
}

const VISION_PRIORITY = 1;
const TEXT_PRIORITY = 2;
const FALLBACK_PRIORITY = 3;

export function getModelsForTask(task: TaskType): ModelInfo[] {
  const models: ModelInfo[] = [];

  switch (task) {
    case "TIMETABLE_EXTRACTION":
      models.push(
        { model: "gemini-flash-latest", provider: "gemini", keyIndex: 0, supportsVision: true, supportsText: false, priority: VISION_PRIORITY },
        { model: "gemini-3.6-flash", provider: "gemini", keyIndex: 0, supportsVision: true, supportsText: false, priority: VISION_PRIORITY },
        { model: "gemini-2.5-flash", provider: "gemini", keyIndex: 0, supportsVision: true, supportsText: false, priority: VISION_PRIORITY },
        { model: "google/gemma-4-26b-a4b-it:free", provider: "openrouter", keyIndex: 0, supportsVision: true, supportsText: true, priority: VISION_PRIORITY },
        { model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", provider: "openrouter", keyIndex: 0, supportsVision: false, supportsText: true, priority: FALLBACK_PRIORITY },
      );
      break;

    case "FLASHCARD_GENERATION":
    case "SYLLABUS_GENERATION":
    case "SCHEDULE_VALIDATION":
    case "TEXT_EXTRACTION":
      models.push(
        { model: "gemini-flash-latest", provider: "gemini", keyIndex: 0, supportsVision: true, supportsText: true, priority: VISION_PRIORITY },
        { model: "gemini-2.5-flash", provider: "gemini", keyIndex: 0, supportsVision: true, supportsText: true, priority: VISION_PRIORITY },
        { model: "openai/gpt-oss-20b", provider: "groq", keyIndex: 0, supportsVision: false, supportsText: true, priority: TEXT_PRIORITY },
        { model: "qwen/qwen3.6-27b", provider: "groq", keyIndex: 0, supportsVision: false, supportsText: true, priority: TEXT_PRIORITY },
        { model: "google/gemma-4-26b-a4b-it:free", provider: "openrouter", keyIndex: 0, supportsVision: true, supportsText: true, priority: FALLBACK_PRIORITY },
      );
      break;

    case "SCHEDULE_SUGGESTIONS":
      models.push(
        { model: "gemini-flash-latest", provider: "gemini", keyIndex: 0, supportsVision: false, supportsText: true, priority: VISION_PRIORITY },
        { model: "openai/gpt-oss-20b", provider: "groq", keyIndex: 0, supportsVision: false, supportsText: true, priority: TEXT_PRIORITY },
        { model: "google/gemma-4-26b-a4b-it:free", provider: "openrouter", keyIndex: 0, supportsVision: false, supportsText: true, priority: FALLBACK_PRIORITY },
      );
      break;

    case "DOCUMENT_SUMMARY":
      models.push(
        { model: "gemini-flash-latest", provider: "gemini", keyIndex: 0, supportsVision: false, supportsText: true, priority: VISION_PRIORITY },
        { model: "openai/gpt-oss-20b", provider: "groq", keyIndex: 0, supportsVision: false, supportsText: true, priority: TEXT_PRIORITY },
      );
      break;
  }

  return models
    .filter((m) => isKeyAvailable(m.provider, m.keyIndex))
    .sort((a, b) => a.priority - b.priority);
}

export function selectBestModel(task: TaskType, hasVision: boolean): ModelInfo | null {
  const candidates = getModelsForTask(task);
  PipelineLogger.debug("router", `Models available for ${task}`, { count: candidates.length, hasVision });

  if (hasVision) {
    return candidates.find((m) => m.supportsVision) ?? candidates[0] ?? null;
  }
  return candidates.find((m) => m.supportsText) ?? candidates[0] ?? null;
}

export function getNextAvailableKey(provider: ProviderId, fromIndex: number = 0): number | null {
  let keyCount: number;
  switch (provider) {
    case "gemini": keyCount = GEMINI_KEYS.length; break;
    case "groq": keyCount = GROQ_KEYS.length; break;
    case "openrouter": keyCount = OPENROUTER_KEYS.length; break;
    case "bytez": keyCount = BYTEZ_KEYS.length; break;
  }

  for (let i = fromIndex; i < keyCount; i++) {
    if (isKeyAvailable(provider, i)) return i;
  }
  for (let i = 0; i < fromIndex; i++) {
    if (isKeyAvailable(provider, i)) return i;
  }
  return null;
}

export function markSuccess(provider: ProviderId, keyIndex: number): void {
  recordSuccess(provider, keyIndex);
}

export function markFailure(provider: ProviderId, keyIndex: number): void {
  recordFailure(provider, keyIndex);
}

export function getFallbackChain(task: TaskType): ProviderId[] {
  const order: Record<TaskType, ProviderId[]> = {
    TIMETABLE_EXTRACTION: ["gemini", "openrouter", "groq"],
    FLASHCARD_GENERATION: ["gemini", "groq", "openrouter"],
    SYLLABUS_GENERATION: ["gemini", "openrouter", "groq"],
    DOCUMENT_SUMMARY: ["gemini", "groq"],
    TEXT_EXTRACTION: ["gemini", "groq", "openrouter"],
    SCHEDULE_VALIDATION: ["gemini", "groq", "openrouter"],
    SCHEDULE_SUGGESTIONS: ["gemini", "groq", "openrouter"],
  };
  return order[task] ?? ["gemini", "groq", "openrouter"];
}
