/**
 * OpenRouter AI provider adapter — implements IAIProvider.
 */

import type { IAIProvider } from '../../ports';
import type { AIModel, AIProviderConfig, AIResponse, ChatMessage, Tool } from '../../../types';
import {
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_MODELS_ENDPOINT,
  DEFAULT_MODEL,
} from '../../../utils/constants';
import {
  buildHeaders,
  formatToolDeclarations,
  fetchWithBackoff,
  throwApiError,
} from './api-client';

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

    const res = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await throwApiError(res);
    }

    return (await res.json()) as AIResponse;
  }

  async listModels(): Promise<readonly AIModel[]> {
    const res = await fetch(OPENROUTER_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      await throwApiError(res);
    }

    const data = (await res.json()) as { data: AIModel[] };
    return data.data;
  }
}
