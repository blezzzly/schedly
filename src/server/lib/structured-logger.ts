/**
 * Structured, stage-aware logger for the AI extraction pipeline.
 *
 * Emits one JSON object per event with a stable schema so logs can be shipped
 * to any log aggregator and queried by `pipeline`, `stage`, `level`, and
 * `runId`. Falls back to console when structured logs are not consumed.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StageLogContext {
  pipeline?: string;
  runId?: string;
  stage?: string;
  model?: string;
  [key: string]: unknown;
}

let enabled = process.env.AI_STRUCTURED_LOGGING !== "false";
let minLevel: LogLevel = (process.env.AI_LOG_LEVEL as LogLevel) || "info";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function configureStageLogger(opts?: { enabled?: boolean; level?: LogLevel }) {
  if (opts?.enabled !== undefined) enabled = opts.enabled;
  if (opts?.level) minLevel = opts.level;
}

export function stageLog(
  level: LogLevel,
  stage: string,
  message: string,
  context?: StageLogContext,
  error?: unknown,
) {
  if (!enabled) return;
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    stage,
    message,
    ...(context ?? {}),
    ...(error !== undefined
      ? {
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : String(error),
        }
      : {}),
  };

  const line = JSON.stringify(entry);
  // Errors go to stderr, everything else to stdout.
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const PipelineLogger = {
  debug: (stage: string, msg: string, ctx?: StageLogContext, err?: unknown) => stageLog("debug", stage, msg, ctx, err),
  info: (stage: string, msg: string, ctx?: StageLogContext, err?: unknown) => stageLog("info", stage, msg, ctx, err),
  warn: (stage: string, msg: string, ctx?: StageLogContext, err?: unknown) => stageLog("warn", stage, msg, ctx, err),
  error: (stage: string, msg: string, ctx?: StageLogContext, err?: unknown) =>
    stageLog("error", stage, msg, ctx, err),
};
