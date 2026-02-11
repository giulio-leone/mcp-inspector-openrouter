/**
 * AI provider port — abstract interface for AI API communication.
 * Implementations: OpenRouterAdapter (Phase 3)
 */

import type { ChatMessage, AIResponse, AIModel, Tool } from '../../types';

/** Abstract AI provider interface (hexagonal port) */
export interface IAIProvider {
  /** Send a chat completion request with optional tool definitions */
  sendMessage(
    messages: readonly ChatMessage[],
    tools?: readonly Tool[],
  ): Promise<AIResponse>;

  /** List available models from the provider */
  listModels(): Promise<readonly AIModel[]>;
}
