/**
 * OpenRouterChat — stateful chat with history and streaming support.
 */

import type {
  AIResponse,
  AIResponseChoice,
  ChatMessage,
  ChatRole,
  ChatSendResponse,
  ContentPart,
  ParsedFunctionCall,
} from '../../../types';
import {
  OPENROUTER_CHAT_ENDPOINT,
  AI_MAX_RETRIES,
  AI_RETRY_DELAY_MS,
} from '../../../utils/constants';
import type { ChatSendParams, StreamChunk } from './types';
import {
  buildHeaders,
  formatFunctionDeclarations,
  fetchWithBackoff,
  throwApiError,
  safeParseArguments,
  delay,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  MAX_HISTORY_MESSAGES,
} from './api-client';
import { parseSSEStream } from './streaming';

export class OpenRouterChat {
  private readonly apiKey: string;
  model: string;
  history: ChatMessage[];

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.history = [];
  }

  /**
   * Trim history to keep the last N user/assistant/tool messages,
   * preventing unbounded token growth.
   */
  trimHistory(maxMessages: number = MAX_HISTORY_MESSAGES): void {
    if (this.history.length <= maxMessages) return;

    const trimmed = this.history.length - maxMessages;
    this.history = this.history.slice(-maxMessages);
    console.debug(
      `[OpenRouter] Trimmed ${trimmed} messages from history, keeping last ${maxMessages}`,
    );
  }

  /** Append user or tool messages to history based on message type */
  private appendIncomingMessages(
    message: ChatSendParams['message'],
  ): void {
    if (typeof message === 'string') {
      this.history.push({ role: 'user', content: message });
    } else if (Array.isArray(message) && message.length > 0 && 'type' in message[0]) {
      this.history.push({ role: 'user', content: message as readonly ContentPart[] });
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
  }

  /** Build the request body for the API call */
  private buildRequestBody(
    config: ChatSendParams['config'],
    stream = false,
  ): Record<string, unknown> {
    const systemMessage: ChatMessage | null = config?.systemInstruction
      ? { role: 'system', content: config.systemInstruction.join('\n') }
      : null;

    const functionDecls = config?.tools?.[0]?.functionDeclarations ?? [];

    const body: Record<string, unknown> = {
      model: this.model,
      messages: systemMessage
        ? [systemMessage, ...this.history]
        : this.history,
      temperature: config?.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: config?.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (stream) {
      body.stream = true;
    }

    if (functionDecls.length > 0) {
      body.tools = formatFunctionDeclarations(functionDecls);
    }

    return body;
  }

  async sendMessage(params: ChatSendParams): Promise<ChatSendResponse> {
    const { message, config } = params;

    this.appendIncomingMessages(message);
    this.trimHistory(MAX_HISTORY_MESSAGES);

    const body = this.buildRequestBody(config);

    console.debug(
      `[OpenRouter] Request: model=${this.model}, messages=${(body.messages as ChatMessage[]).length}, tools=${(config?.tools?.[0]?.functionDeclarations ?? []).length}`,
    );

    // Retry logic for empty responses
    let data: AIResponse | undefined;

    for (let attempt = 0; attempt < AI_MAX_RETRIES; attempt++) {
      const res = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
        method: 'POST',
        headers: buildHeaders(this.apiKey),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await throwApiError(res);
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

    // Log token usage when available
    if (data.usage) {
      console.debug(
        `[OpenRouter] Usage: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}, total=${data.usage.total_tokens}`,
      );
    }

    const assistantMessage = data.choices[0].message;

    // Ensure content is never null in stored history
    const historyEntry: ChatMessage = {
      ...assistantMessage,
      content: assistantMessage.content ?? '',
    };
    this.history.push(historyEntry);

    // Parse function calls with safe argument parsing
    const functionCalls: ParsedFunctionCall[] | undefined =
      assistantMessage.tool_calls?.map((tc) => ({
        name: tc.function.name,
        args: safeParseArguments(
          tc.function.arguments,
          tc.id,
          tc.function.name,
        ),
        id: tc.id,
      }));

    // Merge text and tool_calls: some models return both
    const textContent =
      typeof assistantMessage.content === 'string'
        ? assistantMessage.content
        : '';

    return {
      text: textContent,
      functionCalls,
      candidates: data.choices as readonly AIResponseChoice[],
    };
  }

  /**
   * Send a message and stream the response token-by-token via SSE.
   * Yields StreamChunk objects; the final chunk has `done: true`.
   */
  async *sendMessageStreaming(
    params: ChatSendParams,
  ): AsyncGenerator<StreamChunk> {
    const { message, config } = params;

    this.appendIncomingMessages(message);
    this.trimHistory(MAX_HISTORY_MESSAGES);

    const body = this.buildRequestBody(config, true);

    console.debug(
      `[OpenRouter] Streaming request: model=${this.model}, messages=${(body.messages as ChatMessage[]).length}`,
    );

    const res = await fetchWithBackoff(OPENROUTER_CHAT_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(this.apiKey),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await throwApiError(res);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable for streaming');
    }

    yield* parseSSEStream(reader, this.history);
  }
}
