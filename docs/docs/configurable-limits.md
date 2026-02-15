---
sidebar_position: 6
---

# Configurable Limits

All orchestrator, subagent, and background task limits are configurable with sensible defaults.

## Orchestrator Limits

```typescript
interface OrchestratorLimits {
  maxIterations?: number;   // Default: 10
  loopTimeoutMs?: number;   // Default: 60_000 (60s)
}
```

### Usage

```typescript
const orchestrator = new AgentOrchestrator({
  toolPort,
  contextPort,
  planningPort,
  chatFactory,
  buildConfig,
  limits: {
    maxIterations: 25,       // Allow more tool calls
    loopTimeoutMs: 120_000,  // 2 minute timeout
  },
});
```

### Behavior

| Limit | Value `0` or negative | Effect |
|-------|----------------------|--------|
| `maxIterations` | Loop never enters | Returns immediately |
| `loopTimeoutMs` | Timeout triggers immediately | First iteration breaks |

## Subagent Limits

```typescript
interface SubagentLimits {
  maxConcurrent?: number;     // Default: 3
  defaultTimeoutMs?: number;  // Default: 30_000 (30s)
  maxDepth?: number;          // Default: 2
}
```

### Usage

```typescript
const subagentPort = new SubagentAdapter(agentFactory, {
  maxConcurrent: 5,        // More parallel subagents
  defaultTimeoutMs: 60_000, // 60s per subagent
  maxDepth: 3,             // Allow deeper recursion
});
```

### Behavior

| Limit | When exceeded |
|-------|--------------|
| `maxConcurrent` | `spawn()` returns `{ success: false, error: "Max concurrent..." }` |
| `maxDepth` | `spawn()` returns `{ success: false, error: "Max subagent depth..." }` |
| `defaultTimeoutMs` | Subagent is aborted via `AbortController` |

Per-task timeout can override the default:

```typescript
await subagentPort.spawn({
  prompt: 'Complex task',
  timeoutMs: 120_000, // Override default for this task
});
```

## Background Task Limits

```typescript
const taskAdapter = new BackgroundTaskAdapter({
  maxConcurrent: 10, // Default: 5
});
```

Exceeding `maxConcurrent` throws an `Error` synchronously from `enqueue()`.
