import type {
  ContentPart,
  FunctionDeclaration,
  ParsedFunctionCall,
  ToolResponse,
} from '../../../types';

// ── Chat config types (mirrors the original JS shape) ──

export interface ChatConfig {
  readonly systemInstruction?: readonly string[];
  readonly tools?: readonly [
    { readonly functionDeclarations: readonly FunctionDeclaration[] },
  ];
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface ChatSendParams {
  readonly message: string | readonly ContentPart[] | readonly ToolResponse[];
  readonly config?: ChatConfig;
}

/** A single streamed chunk from sendMessageStreaming */
export interface StreamChunk {
  readonly text: string;
  readonly done: boolean;
  readonly functionCalls?: readonly ParsedFunctionCall[];
}

/** OpenRouter error response shape */
export interface OpenRouterErrorBody {
  error?: {
    message?: string;
    code?: number | string;
    type?: string;
    metadata?: { reasons?: string[] };
  };
}
