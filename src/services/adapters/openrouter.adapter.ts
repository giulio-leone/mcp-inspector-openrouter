/**
 * OpenRouter AI provider adapter — implements IAIProvider.
 * Converted from: openrouter-bridge.js
 */

import type { IAIProvider } from '../ports';
import type {
  AIModel,
  AIProviderConfig,
  AIResponse,
  AIResponseChoice,
  ChatMessage,
  ChatRole,
  ChatSendResponse,
  FunctionDeclaration,
  ParsedFunctionCall,
  Tool,
  ToolDeclaration,
  ToolResponse,
} from '../../types';
import {
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_MODELS_ENDPOINT,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
  DEFAULT_MODEL,
  AI_MAX_RETRIES,
  AI_RETRY_DELAY_MS,
} from '../../utils/constants';

// ── Helpers ──

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': OPENROUTER_TITLE,
  };
}

function formatToolDeclarations(tools: readonly Tool[]): ToolDeclaration[] {
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

function formatFunctionDeclarations(
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

/** Parse a raw API error body into a meaningful message */
async function parseApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── OpenRouterAdapter (implements IAIProvider) ──

export class OpenRouterAdapter implements IAIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async sendMessage(
    messages: readonly ChatMessage[],
    tools?: readonly Tool[],
  ): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    if (tools && tools.length > 0) {
      body.tools = formatToolDeclarations(tools);
    }

    const res = await fetch(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }

    return (await res.json()) as AIResponse;
  }

  async listModels(): Promise<readonly AIModel[]> {
    const res = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }

    const data = (await res.json()) as { data: AIModel[] };
    return data.data;
  }
}

// ── Chat config types (mirrors the original JS shape) ──

export interface ChatConfig {
  readonly systemInstruction?: readonly string[];
  readonly tools?: readonly [
    { readonly functionDeclarations: readonly FunctionDeclaration[] },
  ];
}

export interface ChatSendParams {
  readonly message: string | readonly ToolResponse[];
  readonly config?: ChatConfig;
}

// ── OpenRouterChat (stateful chat with history) ──

export class OpenRouterChat {
  private readonly apiKey: string;
  model: string;
  history: ChatMessage[];

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.history = [];
  }

  async sendMessage(params: ChatSendParams): Promise<ChatSendResponse> {
    const { message, config } = params;

    // Append user or tool messages to history
    if (typeof message === 'string') {
      this.history.push({ role: 'user', content: message });
    } else if (Array.isArray(message)) {
      for (const m of message) {
        if (m.functionResponse) {
          this.history.push({
            role: 'tool' as ChatRole,
            tool_call_id: m.functionResponse.tool_call_id,
            content: JSON.stringify(
              m.functionResponse.response.result ??
                m.functionResponse.response.error,
            ),
          });
        }
      }
    }

    const systemMessage: ChatMessage | null = config?.systemInstruction
      ? { role: 'system', content: config.systemInstruction.join('\n') }
      : null;

    const functionDecls = config?.tools?.[0]?.functionDeclarations ?? [];

    const body: Record<string, unknown> = {
      model: this.model,
      messages: systemMessage
        ? [systemMessage, ...this.history]
        : this.history,
    };

    if (functionDecls.length > 0) {
      body.tools = formatFunctionDeclarations(functionDecls);
    }

    // Retry logic for empty responses
    let data: AIResponse | undefined;

    for (let attempt = 0; attempt < AI_MAX_RETRIES; attempt++) {
      const res = await fetch(OPENROUTER_CHAT_ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      data = (await res.json()) as AIResponse;

      if (
        data.choices &&
        data.choices.length > 0 &&
        data.choices[0].message
      ) {
        break;
      }

      console.warn(
        `[OpenRouter] Empty response on attempt ${attempt + 1}/${AI_MAX_RETRIES}, retrying...`,
      );
      if (attempt < AI_MAX_RETRIES - 1) {
        await delay(AI_RETRY_DELAY_MS);
      }
    }

    if (!data?.choices?.length || !data.choices[0].message) {
      throw new Error(
        'OpenRouter returned no response after multiple attempts.',
      );
    }

    const assistantMessage = data.choices[0].message;

    // Ensure content is never null in stored history
    const historyEntry: ChatMessage = {
      ...assistantMessage,
      content: assistantMessage.content ?? '',
    };
    this.history.push(historyEntry);

    const functionCalls: ParsedFunctionCall[] | undefined =
      assistantMessage.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        id: tc.id,
      }));

    return {
      text: assistantMessage.content ?? '',
      functionCalls,
      candidates: data.choices as readonly AIResponseChoice[],
    };
  }
}
