/**
 * Shared types for the hexagonal port layer.
 *
 * These types are owned by the domain and used across all ports/adapters.
 * They intentionally duplicate minimal fields from existing types to keep
 * the port layer decoupled from infrastructure concerns.
 */

import type {
  CleanTool,
  PageContext,
  Message,
  Plan,
  PlanStep,
} from '../types';
import type { LiveStateSnapshot } from '../types/live-state.types';

// ── Agent Types ──

/** Context provided to the agent for a single run */
export interface AgentContext {
  readonly pageContext: PageContext | null;
  readonly tools: readonly ToolDefinition[];
  readonly conversationHistory: readonly Message[];
  readonly liveState: LiveStateSnapshot | null;
  readonly tabId: number;
  readonly mentionContexts?: readonly MentionContext[];
}

/** Cross-tab mention context */
export interface MentionContext {
  readonly tabId: number;
  readonly title: string;
  readonly context: PageContext;
}

/** Result from a single agent run */
export interface AgentResult {
  readonly text: string;
  readonly reasoning?: string;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly updatedTools: readonly ToolDefinition[];
  readonly updatedPageContext: PageContext | null;
  readonly stepsCompleted: number;
}

/** Record of a tool call and its result */
export interface ToolCallRecord {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly callId: string;
  readonly result: ToolCallResult;
}

/** Outcome of a single tool execution */
export interface ToolCallResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

// ── Tool Execution Types ──

/** Target for tool execution routing */
export interface ToolTarget {
  readonly tabId: number;
  readonly originTabId?: number;
}

/** Standardised tool definition for the port layer */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parametersSchema: Record<string, unknown>;
  readonly category?: string;
}

// ── Subagent Types ──

/** Task definition for spawning a subagent */
export interface SubagentTask {
  readonly prompt: string;
  readonly instructions?: string;
  readonly tools?: readonly ToolDefinition[];
  readonly context?: AgentContext;
  readonly maxSteps?: number;
  readonly timeoutMs?: number;
  readonly depth?: number;
}

/** Result from a subagent execution */
export interface SubagentResult {
  readonly subagentId: string;
  readonly text: string;
  readonly success: boolean;
  readonly stepsCompleted: number;
  readonly error?: string;
}

/** Info about a currently running subagent */
export interface SubagentInfo {
  readonly id: string;
  readonly task: string;
  readonly startedAt: number;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled';
}

// ── Context Types ──

/** Summary of conversation context after compression */
export interface ContextSummary {
  readonly originalCount: number;
  readonly compressedCount: number;
  readonly summary: string;
}

/** Cumulative token usage snapshot */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

// ── Typed Event Map ──

/** Typed event map for the agent orchestrator */
export interface AgentEventMap {
  readonly 'tool:call': { readonly name: string; readonly args: Record<string, unknown> };
  readonly 'tool:result': { readonly name: string; readonly data: unknown; readonly success: boolean };
  readonly 'tool:error': { readonly name: string; readonly error: string };
  readonly 'ai:response': { readonly text: string; readonly reasoning?: string };
  readonly 'navigation': { readonly toolName: string };
  readonly 'subagent:started': { readonly subagentId: string; readonly task: string };
  readonly 'subagent:completed': { readonly subagentId: string; readonly text: string; readonly stepsCompleted: number };
  readonly 'subagent:failed': { readonly subagentId: string; readonly error: string };
  readonly 'timeout': undefined;
  readonly 'max_iterations': undefined;
}

// ── Orchestrator Event Types ──

/** Event emitted by the orchestrator during execution */
export type OrchestratorEvent =
  | { readonly type: 'tool_call'; readonly name: string; readonly args: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly name: string; readonly data: unknown; readonly success: boolean }
  | { readonly type: 'tool_error'; readonly name: string; readonly error: string }
  | { readonly type: 'ai_response'; readonly text: string; readonly reasoning?: string }
  | { readonly type: 'navigation'; readonly toolName: string }
  | { readonly type: 'subagent_started'; readonly subagentId: string; readonly task: string }
  | { readonly type: 'subagent_completed'; readonly subagentId: string; readonly text: string; readonly stepsCompleted: number }
  | { readonly type: 'subagent_failed'; readonly subagentId: string; readonly error: string }
  | { readonly type: 'timeout' }
  | { readonly type: 'max_iterations' };

/** Callback for orchestrator events */
export type OrchestratorEventListener = (event: OrchestratorEvent) => void;

// ── Re-exports for convenience ──

export type {
  CleanTool,
  PageContext,
  Message,
  Plan,
  PlanStep,
  LiveStateSnapshot,
};
