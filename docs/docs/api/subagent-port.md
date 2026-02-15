---
sidebar_position: 5
---

# ISubagentPort

Spawns and manages child agents for task delegation. Supports configurable depth, concurrency, and timeout limits.

## Interface

```typescript
export interface ISubagentPort {
  spawn(task: SubagentTask): Promise<SubagentResult>;
  getActiveSubagents(): readonly SubagentInfo[];
  cancel(subagentId: string): Promise<void>;
}
```

## Methods

### `spawn(task)`

Creates a child agent to handle a delegated task. The child runs with its own AI chat instance and a no-op planning port.

### `getActiveSubagents()`

Returns info about currently running subagents.

### `cancel(subagentId)`

Aborts a running subagent via `AbortController`.

## Types

```typescript
interface SubagentTask {
  prompt: string;
  context?: AgentContext;
  tools?: readonly ToolDefinition[];
  depth?: number;
  timeoutMs?: number;
}

interface SubagentResult {
  subagentId: string;
  text: string;
  success: boolean;
  stepsCompleted: number;
  error?: string;
}

interface SubagentInfo {
  id: string;
  task: string;
  startedAt: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}
```

## Configurable Limits

```typescript
interface SubagentLimits {
  maxConcurrent?: number;    // Default: 3
  defaultTimeoutMs?: number; // Default: 30_000 (30s)
  maxDepth?: number;         // Default: 2
}

// Usage
const subagentPort = new SubagentAdapter(agentFactory, {
  maxConcurrent: 5,
  defaultTimeoutMs: 60_000,
  maxDepth: 3,
});
```

## Adapter: SubagentAdapter

Each subagent gets its own `OpenRouterChat` to avoid conversation history corruption. The factory pattern enables recursive composition without circular dependencies.
