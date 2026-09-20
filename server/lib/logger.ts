/**
 * Structured server-side logger for the API layer. Mirrors
 * server/ai/logger.ts's redaction behavior but is kept as an independent
 * module so the API layer has no dependency on the AI layer's internals.
 */

const SECRET_KEY_PATTERN = /(api[_-]?key|service[_-]?role|token|secret|signed[_-]?url|authorization|jwt)/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 20 && /^[A-Za-z0-9_\-.]+$/.test(value)) {
      return `${value.slice(0, 4)}***REDACTED***`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "***REDACTED***" : redact(v);
    }
    return out;
  }
  return value;
}

export type LogLevel = "info" | "warn" | "error";

export interface ApiLogFields {
  operation: string;
  route?: string;
  method?: string;
  userId?: string;
  projectId?: string;
  roomUploadId?: string;
  visualizationId?: string;
  generationJobId?: string;
  durationMs?: number;
  status?: number;
  errorCategory?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: ApiLogFields) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(redact(fields) as object),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const apiLogger = {
  info: (message: string, fields: ApiLogFields) => emit("info", message, fields),
  warn: (message: string, fields: ApiLogFields) => emit("warn", message, fields),
  error: (message: string, fields: ApiLogFields) => emit("error", message, fields),
};
