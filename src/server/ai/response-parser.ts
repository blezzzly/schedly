export interface ParseResult {
  success: boolean;
  data: Record<string, unknown> | null;
  error?: string;
}

const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;
const JSON_ARRAY_PATTERN = /\[[\s\S]*\]/;

export function extractJsonFromText(text: string): ParseResult {
  if (!text || typeof text !== "string") {
    return { success: false, data: null, error: "No text content" };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { success: false, data: null, error: "Empty text content" };
  }

  try {
    const direct = JSON.parse(trimmed);
    if (typeof direct === "object" && direct !== null) {
      return { success: true, data: direct as Record<string, unknown> };
    }
  } catch {
  }

  const objectMatch = trimmed.match(JSON_OBJECT_PATTERN);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (typeof parsed === "object" && parsed !== null) {
        return { success: true, data: parsed as Record<string, unknown> };
      }
    } catch {
    }
  }

  const arrayMatch = trimmed.match(JSON_ARRAY_PATTERN);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return { success: true, data: parsed as unknown as Record<string, unknown> };
      }
    } catch {
    }
  }

  return {
    success: false,
    data: null,
    error: "No valid JSON found in response",
  };
}

export interface SafeJsonParseOptions {
  fallback?: Record<string, unknown>;
  requiredFields?: string[];
}

export function safeJsonParse<T = Record<string, unknown>>(
  text: string,
  options: SafeJsonParseOptions = {},
): { success: boolean; data: T | null; error?: string } {
  const extracted = extractJsonFromText(text);

  if (!extracted.success || !extracted.data) {
    if (options.fallback) {
      return { success: true, data: options.fallback as T };
    }
    return { success: false, data: null, error: extracted.error };
  }

  if (options.requiredFields && options.requiredFields.length > 0) {
    const missing = options.requiredFields.filter((f) => !(f in extracted.data!));
    if (missing.length > 0) {
      return {
        success: false,
        data: null,
        error: `Missing required fields: ${missing.join(", ")}`,
      };
    }
  }

  return { success: true, data: extracted.data as T };
}

export function tryRepairJson(text: string): string | null {
  if (!text) return null;

  let repaired = text.trim();

  repaired = repaired
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();

  repaired = repaired
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}
