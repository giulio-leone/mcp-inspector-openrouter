/**
 * AI provider types (OpenRouter / OpenAI-compatible API).
 * Extracted from: openrouter-bridge.js, sidebar.js, wmcp-ai-classifier.js
 */

// ── Models ──

/** AI model info from the OpenRouter models endpoint */
export interface AIModel {
  readonly id: string;
  readonly name: string;
  readonly context_length?: number;
  readonly pricing?: AIModelPricing;
}

/** Pricing info for an AI model */
export interface AIModelPricing {
  readonly prompt: string;
  readonly completion: string;
}

// ── Chat Messages ──

/** Role in the OpenAI-compatible chat format */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A message in the OpenAI-compatible chat format */
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
  readonly tool_calls?: readonly ToolCall[];
  /** Used when role is 'tool' to reference the originating tool call */
  readonly tool_call_id?: string;
}

// ── Tool Calls ──

/** A tool call from the AI (OpenAI function calling format) */
export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: ToolCallFunction;
}

/** Function details within a tool call */
export interface ToolCallFunction {
  readonly name: string;
  readonly arguments: string;
}

/** Parsed function call as returned by OpenRouterChat.sendMessage */
export interface ParsedFunctionCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly id: string;
}

// ── Tool Declaration (for API request) ──

/** Tool definition sent to the API in the request body */
export interface ToolDeclaration {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

/** Function declaration format used by the GenAI-style config */
export interface FunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parametersJsonSchema: Record<string, unknown>;
}

// ── API Response ──

/** Choice within an AI API response */
export interface AIResponseChoice {
  readonly message: ChatMessage;
  readonly finish_reason?: string;
  readonly index?: number;
}

/** Response from the OpenRouter/OpenAI chat completions API */
export interface AIResponse {
  readonly choices: readonly AIResponseChoice[];
  readonly model?: string;
  readonly usage?: AIUsage;
}

/** Token usage info from the API */
export interface AIUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

// ── Chat Response (internal bridge format) ──

/** Response from OpenRouterChat.sendMessage (internal format) */
export interface ChatSendResponse {
  readonly text: string;
  readonly functionCalls?: readonly ParsedFunctionCall[];
  readonly candidates: readonly AIResponseChoice[];
}

/** Tool response sent back to the AI after execution */
export interface ToolResponse {
  readonly functionResponse: {
    readonly name: string;
    readonly response: {
      readonly result?: unknown;
      readonly error?: string;
    };
    readonly tool_call_id: string;
  };
}

// ── Provider Config ──

/** Configuration for the AI provider */
export interface AIProviderConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

/** Configuration for the AI classifier */
export interface AIClassifierConfig {
  readonly confidenceThreshold: number;
  readonly batchSize: number;
  readonly model: string;
  readonly cacheTTL: number;
}
