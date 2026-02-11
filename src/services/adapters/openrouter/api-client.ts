import type { FunctionDeclaration, Tool, ToolDeclaration } from '../../../types';
import {
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
} from '../../../utils/constants';
import {
  OpenRouterError,
  AuthenticationError,
  RateLimitError,
  ModelError,
} from './errors';
import type { OpenRouterErrorBody } from './types';

// ── Constants ──

export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 4096;
export const MAX_HISTORY_MESSAGES = 30;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_RETRIES = 3;

// ── Helpers ──

export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': OPENROUTER_TITLE,
  };
}

export function formatToolDeclarations(tools: readonly Tool[]): ToolDeclaration[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters:
        typeof t.inputSchema === 'string'
          ? (JSON.parse(t.inputSchema) as Record<string, unknown>)
          : (t.inputSchema as unknown as Record<string, unknown>),
    },
  }));
}

export function formatFunctionDeclarations(
  decls: readonly FunctionDeclaration[],
): ToolDeclaration[] {
  return decls.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parametersJsonSchema,
    },
  }));
}

/** Parse a raw API error body and throw a typed error */
export async function throwApiError(res: Response): Promise<never> {
  let body: OpenRouterErrorBody | undefined;
  try {
    body = (await res.json()) as OpenRouterErrorBody;
  } catch {
    // If JSON parsing fails, fall through to generic error
  }

  const message = body?.error?.message ?? res.statusText;

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
    throw new RateLimitError(message, retryMs);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationError(message, res.status);
  }
  const errorType = body?.error?.type ?? '';
  if (
    res.status === 400 ||
    errorType.includes('model') ||
    errorType.includes('context')
  ) {
    throw new ModelError(message, res.status);
  }

  throw new OpenRouterError(message, res.status);
}

/** Safe JSON.parse for tool call arguments; returns empty object on failure */
export function safeParseArguments(
  raw: string,
  toolCallId: string,
  fnName: string,
): Record<string, unknown> {
  if (!raw || raw.trim() === '') {
    console.warn(
      `[OpenRouter] Tool call ${toolCallId} (${fnName}) has empty arguments, defaulting to {}`,
    );
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.error(
      `[OpenRouter] Failed to parse arguments for tool call ${toolCallId} (${fnName}):`,
      raw,
      e,
    );
    return {};
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Execute a fetch with exponential backoff on rate-limit errors */
export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;

    const retryAfter = res.headers.get('retry-after');
    const waitMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);

    console.warn(
      `[OpenRouter] Rate limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
    );

    if (attempt === RATE_LIMIT_MAX_RETRIES - 1) return res;
    await delay(waitMs);
  }
  // Should not reach here, but return last attempt
  return fetch(url, init);
}
