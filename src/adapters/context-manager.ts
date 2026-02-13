/**
 * ContextManager — manages context window budget via tool-result
 * offloading and token tracking.
 *
 * Large tool results are replaced with a truncated preview and a
 * reference ID that can be used to retrieve the full content later.
 * Token usage is tracked cumulatively across request/response cycles.
 */

import type { IContextManagerPort } from '../ports/context-manager.port';
import type { TokenUsage } from '../ports/types';

export interface ContextManagerConfig {
  /** Max tokens for a single tool result before offloading (default: 5000) */
  readonly offloadThreshold: number;
  /** Max chars to keep inline when offloading (default: 500) */
  readonly offloadPreviewChars: number;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  offloadThreshold: 5000,
  offloadPreviewChars: 500,
};

export class ContextManager implements IContextManagerPort {
  private readonly config: ContextManagerConfig;
  private inputTokens = 0;
  private outputTokens = 0;
  private counter = 0;
  /** Map of offloaded content by reference ID */
  private readonly offloaded = new Map<string, string>();

  constructor(config?: Partial<ContextManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a tool result string. If it exceeds offloadThreshold,
   * store the full content and return a truncated preview.
   * Otherwise return the original string.
   */
  processToolResult(toolName: string, result: string): string {
    const tokens = this.estimateTokens(result);
    if (tokens <= this.config.offloadThreshold) return result;

    const refId = `offload-${toolName}-${this.counter++}`;
    this.offloaded.set(refId, result);

    const preview = result.slice(0, this.config.offloadPreviewChars);
    return `${preview}\n\n[… ${tokens} tokens offloaded — ref: ${refId}]`;
  }

  /** Retrieve an offloaded result by its reference ID */
  getOffloaded(refId: string): string | undefined {
    return this.offloaded.get(refId);
  }

  /** Track token usage for a request/response cycle */
  trackUsage(inputTokens: number, outputTokens: number): void {
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
  }

  /** Estimate tokens for a string (4 chars per token) */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** Get cumulative token usage */
  getUsage(): TokenUsage {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.inputTokens + this.outputTokens,
    };
  }

  /** Reset all state (offloaded content, usage counters) */
  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.counter = 0;
    this.offloaded.clear();
  }
}
