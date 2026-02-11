import type { ChatMessage, ParsedFunctionCall } from '../../../types';
import type { StreamChunk } from './types';
import { safeParseArguments } from './api-client';

/**
 * Parse an SSE stream from the OpenRouter API, yielding StreamChunk objects.
 * Appends the final assistant message to the provided history array.
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  history: ChatMessage[],
): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  const accumulatedToolCalls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          let functionCalls: ParsedFunctionCall[] | undefined;
          if (accumulatedToolCalls.size > 0) {
            functionCalls = [];
            for (const tc of accumulatedToolCalls.values()) {
              functionCalls.push({
                name: tc.name,
                args: safeParseArguments(tc.arguments, tc.id, tc.name),
                id: tc.id,
              });
            }
          }

          history.push({ role: 'assistant', content: fullText });
          yield { text: '', done: true, functionCalls };
          return;
        }

        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullText += delta.content;
            yield { text: delta.content, done: false };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = accumulatedToolCalls.get(tc.index);
              if (existing) {
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
              } else {
                accumulatedToolCalls.set(tc.index, {
                  id: tc.id ?? '',
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                });
              }
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Fallback: if stream ended without [DONE]
  history.push({ role: 'assistant', content: fullText });

  let functionCalls: ParsedFunctionCall[] | undefined;
  if (accumulatedToolCalls.size > 0) {
    functionCalls = [];
    for (const tc of accumulatedToolCalls.values()) {
      functionCalls.push({
        name: tc.name,
        args: safeParseArguments(tc.arguments, tc.id, tc.name),
        id: tc.id,
      });
    }
  }

  yield { text: '', done: true, functionCalls };
}
