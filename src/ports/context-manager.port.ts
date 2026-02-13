/**
 * IContextManagerPort — contract for context window budget management.
 *
 * Handles tool-result offloading (large results replaced with a summary
 * reference) and cumulative token usage tracking.
 */

import type { TokenUsage } from './types';

export interface IContextManagerPort {
  /** Process a tool result; offload if it exceeds the token threshold */
  processToolResult(toolName: string, result: string): string;

  /** Retrieve an offloaded result by its reference ID */
  getOffloaded(refId: string): string | undefined;

  /** Track token usage for a request/response cycle */
  trackUsage(inputTokens: number, outputTokens: number): void;

  /** Estimate tokens for a string (4 chars per token) */
  estimateTokens(text: string): number;

  /** Get cumulative token usage */
  getUsage(): TokenUsage;

  /** Reset all state (offloaded content, usage counters) */
  reset(): void;
}
