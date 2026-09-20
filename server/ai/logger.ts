/**
 * Structured server-side logger for AI operations.
 *
 * Only ever call this from server/ code (API routes, this service layer).
 * Never log raw image bytes, prompts containing user PII beyond IDs, or
 * any secret. `redact` is applied defensively even to fields we don't
 * expect to contain secrets, in case a caller passes something unexpected.
 */

const SECRET_KEY_PATTERN = /(api[_-]?key|service[_-]?role|token|secret|signed[_-]?url|authorization)/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Defensive: if a raw key/token-shaped string slipped in, mask it.
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

export interface AiLogFields {
  operation: string;
  model?: string;
  roomUploadId?: string;
  projectId?: string;
  visualizationId?: string;
  generationJobId?: string;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  errorCategory?: string;
  attempt?: number;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: AiLogFields) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redact(fields) as object,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const aiLogger = {
  info: (message: string, fields: AiLogFields) => emit("info", message, fields),
  warn: (message: string, fields: AiLogFields) => emit("warn", message, fields),
  error: (message: string, fields: AiLogFields) => emit("error", message, fields),
};
