/**
 * Typed AI-service error hierarchy.
 *
 * Every error carries:
 *  - `code`: stable machine-readable identifier for API routes/logging
 *  - `safeMessage`: what may be shown to the end user
 *  - `cause`/internal details: logged server-side only, never serialized to a client response
 */

export type AiErrorCode =
  | "AI_CONFIG_MISSING_API_KEY"
  | "AI_INVALID_IMAGE"
  | "AI_IMAGE_TOO_LARGE"
  | "AI_UNSUPPORTED_IMAGE_FORMAT"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_UPSTREAM_FAILURE"
  | "AI_EMPTY_RESPONSE"
  | "AI_MALFORMED_STRUCTURED_OUTPUT"
  | "AI_INVALID_TILE_RECOMMENDATION"
  | "AI_TILE_IMAGE_UNAVAILABLE"
  | "AI_VISUALIZATION_FAILED";

export class AiServiceError extends Error {
  readonly code: AiErrorCode;
  readonly safeMessage: string;
  readonly retryable: boolean;

  constructor(params: {
    code: AiErrorCode;
    safeMessage: string;
    internalMessage: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.internalMessage);
    this.name = "AiServiceError";
    this.code = params.code;
    this.safeMessage = params.safeMessage;
    this.retryable = params.retryable ?? false;
    if (params.cause !== undefined) {
      // Standard Error `cause` — kept server-side only, never spread into API responses.
      (this as { cause?: unknown }).cause = params.cause;
    }
  }

  /** Safe to send in an API response body — never includes internal details or secrets. */
  toClientPayload() {
    return { error: this.safeMessage, code: this.code };
  }
}

export class GeminiConfigError extends AiServiceError {
  constructor(missingVar: string) {
    super({
      code: "AI_CONFIG_MISSING_API_KEY",
      safeMessage: "The AI service is not configured. Please try again later.",
      internalMessage: `Missing required server environment variable: ${missingVar}`,
      retryable: false,
    });
    this.name = "GeminiConfigError";
  }
}

export class ImageValidationError extends AiServiceError {
  constructor(code: "AI_INVALID_IMAGE" | "AI_IMAGE_TOO_LARGE" | "AI_UNSUPPORTED_IMAGE_FORMAT", detail: string) {
    super({
      code,
      safeMessage: "The uploaded image could not be processed. Please upload a JPEG, PNG, or WebP photo.",
      internalMessage: detail,
      retryable: false,
    });
    this.name = "ImageValidationError";
  }
}

export class GeminiTimeoutError extends AiServiceError {
  constructor(operation: string, timeoutMs: number) {
    super({
      code: "AI_TIMEOUT",
      safeMessage: "The AI service took too long to respond. Please try again.",
      internalMessage: `Gemini operation "${operation}" exceeded timeout of ${timeoutMs}ms`,
      retryable: true,
    });
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiRateLimitError extends AiServiceError {
  constructor(operation: string, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause ?? "");
    const exhausted = /limit:\s*0|quota.*(?:exhausted|exceeded)|billing.*(?:disabled|account)|resource_exhausted/i.test(detail);
    super({
      code: "AI_RATE_LIMITED",
      safeMessage: exhausted
        ? "Gemini image generation is unavailable for this API project because its quota or billing is not enabled. Enable image-generation quota for the same Google Cloud project as GEMINI_API_KEY, then retry."
        : "The AI service is busy right now. Please try again shortly.",
      internalMessage: `Gemini operation "${operation}" was rate limited`,
      retryable: true,
      cause,
    });
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiUpstreamError extends AiServiceError {
  constructor(operation: string, cause?: unknown) {
    super({
      code: "AI_UPSTREAM_FAILURE",
      safeMessage: "The AI service failed to respond. Please try again.",
      internalMessage: `Gemini operation "${operation}" failed`,
      retryable: true,
      cause,
    });
    this.name = "GeminiUpstreamError";
  }
}

export class GeminiEmptyResponseError extends AiServiceError {
  constructor(operation: string) {
    super({
      code: "AI_EMPTY_RESPONSE",
      safeMessage: "The AI service returned no result. Please try again.",
      internalMessage: `Gemini operation "${operation}" returned an empty response (possibly safety-blocked)`,
      retryable: false,
    });
    this.name = "GeminiEmptyResponseError";
  }
}

export class RoomAnalysisValidationError extends AiServiceError {
  constructor(issues: string) {
    super({
      code: "AI_MALFORMED_STRUCTURED_OUTPUT",
      safeMessage: "We couldn't reliably analyze this room photo. Please try a different photo.",
      internalMessage: `Room analysis structured output failed validation: ${issues}`,
      retryable: false,
    });
    this.name = "RoomAnalysisValidationError";
  }
}

export class TileRecommendationValidationError extends AiServiceError {
  constructor(issues: string) {
    super({
      code: "AI_INVALID_TILE_RECOMMENDATION",
      safeMessage: "We couldn't generate tile recommendations right now.",
      internalMessage: `Tile recommendation structured output failed validation: ${issues}`,
      retryable: false,
    });
    this.name = "TileRecommendationValidationError";
  }
}

export class TileImageUnavailableError extends AiServiceError {
  constructor(tileId: string) {
    super({
      code: "AI_TILE_IMAGE_UNAVAILABLE",
      safeMessage: "The selected tile's image could not be loaded.",
      internalMessage: `Tile image unavailable for tile id ${tileId}`,
      retryable: false,
    });
    this.name = "TileImageUnavailableError";
  }
}

export class VisualizationGenerationError extends AiServiceError {
  constructor(detail: string, retryable: boolean, cause?: unknown) {
    super({
      code: "AI_VISUALIZATION_FAILED",
      safeMessage: "We couldn't generate the visualization. Please try again.",
      internalMessage: detail,
      retryable,
      cause,
    });
    this.name = "VisualizationGenerationError";
  }
}
