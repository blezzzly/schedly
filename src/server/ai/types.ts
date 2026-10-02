export type TaskType =
  | "TIMETABLE_EXTRACTION"
  | "FLASHCARD_GENERATION"
  | "SYLLABUS_GENERATION"
  | "DOCUMENT_SUMMARY"
  | "TEXT_EXTRACTION"
  | "SCHEDULE_VALIDATION"
  | "SCHEDULE_SUGGESTIONS";

export type ProviderId = "gemini" | "groq" | "openrouter" | "bytez";

export type ProviderHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "AUTH_FAILED"
  | "DISABLED";

export interface ProviderKey {
  id: string;
  index: number;
  health: ProviderHealth;
  lastSuccess: number | null;
  lastFailure: number | null;
  cooldownUntil: number | null;
  failureCount: number;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  health: ProviderHealth;
  keys: ProviderKey[];
  isAvailable: boolean;
}

export interface AiRequest {
  task: TaskType;
  input: {
    image?: { base64: string; mimeType: string };
    text?: string;
    json?: Record<string, unknown>;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
    customModel?: string;
  };
}

export interface AiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  provider?: ProviderId;
  model?: string;
  usedFallback?: boolean;
  latencyMs?: number;
}

export interface TaskConfig {
  requiresVision: boolean;
  requiresText: boolean;
  maxTokens: number;
  temperature: number;
  description: string;
}

export const TASK_CONFIGS: Record<TaskType, TaskConfig> = {
  TIMETABLE_EXTRACTION: {
    requiresVision: true,
    requiresText: false,
    maxTokens: 8192,
    temperature: 0.1,
    description: "Extract class schedule from image",
  },
  FLASHCARD_GENERATION: {
    requiresVision: false,
    requiresText: true,
    maxTokens: 8192,
    temperature: 0.2,
    description: "Generate flashcards from text",
  },
  SYLLABUS_GENERATION: {
    requiresVision: false,
    requiresText: true,
    maxTokens: 8192,
    temperature: 0.1,
    description: "Extract syllabus structure from text",
  },
  DOCUMENT_SUMMARY: {
    requiresVision: false,
    requiresText: true,
    maxTokens: 2048,
    temperature: 0.3,
    description: "Summarize document content",
  },
  TEXT_EXTRACTION: {
    requiresVision: false,
    requiresText: false,
    maxTokens: 4096,
    temperature: 0.1,
    description: "Extract structured data from text",
  },
  SCHEDULE_VALIDATION: {
    requiresVision: false,
    requiresText: true,
    maxTokens: 4096,
    temperature: 0.1,
    description: "Validate and normalize extracted schedule",
  },
  SCHEDULE_SUGGESTIONS: {
    requiresVision: false,
    requiresText: true,
    maxTokens: 2048,
    temperature: 0.9,
    description: "Generate planning suggestions",
  },
};
