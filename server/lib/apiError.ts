/**
 * Typed API-layer errors. Every one carries an HTTP status and a safe
 * `{ code, message }` pair that is the ONLY thing ever sent to the
 * client — internal details (query errors, stack traces, Gemini
 * payloads) are logged server-side only, never serialized in a response.
 */

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PROJECT_NOT_FOUND"
  | "ROOM_NOT_FOUND"
  | "ANALYSIS_NOT_FOUND"
  | "ANALYSIS_REQUIRED"
  | "TILE_NOT_FOUND"
  | "TILE_INACTIVE"
  | "TILE_SURFACE_INCOMPATIBLE"
  | "VISUALIZATION_NOT_FOUND"
  | "RETRY_LIMIT_EXCEEDED"
  | "RATE_LIMITED"
  | "METHOD_NOT_ALLOWED"
  | "UPSTREAM_AI_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PROJECT_NOT_FOUND: 404,
  ROOM_NOT_FOUND: 404,
  ANALYSIS_NOT_FOUND: 404,
  ANALYSIS_REQUIRED: 409,
  TILE_NOT_FOUND: 404,
  TILE_INACTIVE: 409,
  TILE_SURFACE_INCOMPATIBLE: 422,
  VISUALIZATION_NOT_FOUND: 404,
  RETRY_LIMIT_EXCEEDED: 429,
  RATE_LIMITED: 429,
  METHOD_NOT_ALLOWED: 405,
  UPSTREAM_AI_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }

  toPayload() {
    return { error: { code: this.code, message: this.message } };
  }
}

export const Errors = {
  unauthenticated: (msg = "Authentication required.") => new ApiError("UNAUTHENTICATED", msg),
  forbidden: (msg = "You do not have access to this resource.") => new ApiError("FORBIDDEN", msg),
  notFound: (msg = "Resource not found.") => new ApiError("NOT_FOUND", msg),
  validation: (msg: string) => new ApiError("VALIDATION_ERROR", msg),
  projectNotFound: () => new ApiError("PROJECT_NOT_FOUND", "Project not found."),
  roomNotFound: () => new ApiError("ROOM_NOT_FOUND", "Room not found."),
  analysisNotFound: () => new ApiError("ANALYSIS_NOT_FOUND", "No analysis exists for this room yet."),
  analysisRequired: () =>
    new ApiError("ANALYSIS_REQUIRED", "This room has not been analyzed yet. Analyze it before requesting recommendations or a visualization."),
  tileNotFound: () => new ApiError("TILE_NOT_FOUND", "Tile not found."),
  tileInactive: () => new ApiError("TILE_INACTIVE", "This tile is no longer available."),
  tileSurfaceIncompatible: (surface: string) =>
    new ApiError("TILE_SURFACE_INCOMPATIBLE", `This tile cannot be applied to the "${surface}" surface.`),
  visualizationNotFound: () => new ApiError("VISUALIZATION_NOT_FOUND", "Visualization not found."),
  retryLimitExceeded: (max: number) =>
    new ApiError("RETRY_LIMIT_EXCEEDED", `Maximum of ${max} generation attempts reached for this visualization.`),
  rateLimited: (msg = "Too many requests. Please slow down and try again shortly.") => new ApiError("RATE_LIMITED", msg),
  methodNotAllowed: (allowed: string[]) => new ApiError("METHOD_NOT_ALLOWED", `Allowed methods: ${allowed.join(", ")}`),
  upstreamAi: (msg = "The AI service failed. Please try again.") => new ApiError("UPSTREAM_AI_ERROR", msg),
  internal: (msg = "Something went wrong. Please try again.") => new ApiError("INTERNAL_ERROR", msg),
};
