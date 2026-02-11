/** Base class for OpenRouter API errors */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/** Thrown when the API key is invalid or missing (401/403) */
export class AuthenticationError extends OpenRouterError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'AuthenticationError';
  }
}

/** Thrown when rate-limited by the API (429) */
export class RateLimitError extends OpenRouterError {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/** Thrown for model-specific errors (invalid model, context length exceeded) */
export class ModelError extends OpenRouterError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'ModelError';
  }
}
