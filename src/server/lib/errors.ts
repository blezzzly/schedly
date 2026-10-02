export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "AI_PROCESSING_FAILED"
  | "UPLOAD_FAILED"
  | "INTERNAL_ERROR";

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: Record<string, string[]>;
}

export type Result<T> = { success: true; data: T } | { success: false; error: AppError };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function fail(code: AppErrorCode, message: string, details?: Record<string, string[]>): Result<never> {
  return { success: false, error: { code, message, details } };
}

export function unauthorized(message = "Unauthorized"): Result<never> {
  return fail("UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): Result<never> {
  return fail("FORBIDDEN", message);
}

export function notFound(message = "Resource not found"): Result<never> {
  return fail("NOT_FOUND", message);
}

export function validationError(details: Record<string, string[]>, message = "Validation failed"): Result<never> {
  return fail("VALIDATION_ERROR", message, details);
}

export function conflict(message = "Resource already exists"): Result<never> {
  return fail("CONFLICT", message);
}

export function internalError(message = "Internal server error"): Result<never> {
  return fail("INTERNAL_ERROR", message);
}
