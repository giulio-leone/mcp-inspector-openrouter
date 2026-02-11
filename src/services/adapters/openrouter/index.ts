/**
 * OpenRouter adapter module — re-exports all public API.
 */
export { OpenRouterAdapter } from './adapter';
export { OpenRouterChat } from './client';
export {
  OpenRouterError,
  AuthenticationError,
  RateLimitError,
  ModelError,
} from './errors';
export type { ChatConfig, ChatSendParams, StreamChunk } from './types';
