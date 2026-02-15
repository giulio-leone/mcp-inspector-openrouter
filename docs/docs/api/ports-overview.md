---
sidebar_position: 1
---

# Ports Overview

The hexagonal architecture defines **5 stable port interfaces** that decouple the domain from infrastructure. Each port is a TypeScript interface in `src/ports/`.

## Port Summary

| Port | File | Methods | Purpose |
|------|------|---------|---------|
| [`IAgentPort`](./agent-port) | `agent.port.ts` | `run`, `dispose` | AI orchestration entry point |
| [`IToolExecutionPort`](./tool-execution-port) | `tool-execution.port.ts` | `execute`, `getAvailableTools`, `onToolsChanged` | Browser action execution |
| [`IPlanningPort`](./planning-port) | `planning.port.ts` | `createPlan`, `updatePlan`, `advanceStep`, etc. | Plan lifecycle management |
| [`ISubagentPort`](./subagent-port) | `subagent.port.ts` | `spawn`, `getActiveSubagents`, `cancel` | Child agent delegation |
| [`IContextPort`](./context-port) | `context.port.ts` | `getPageContext`, `getLiveState`, etc. | Page context and LiveState |

## Dependency Flow

```
AIChatController
    └─ AgentOrchestrator (implements IAgentPort)
        ├─ IToolExecutionPort  → ChromeToolAdapter
        ├─ IPlanningPort       → PlanningAdapter
        ├─ ISubagentPort       → SubagentAdapter
        └─ IContextPort        → ChromeContextAdapter
```

All ports are defined as `readonly` properties in `OrchestratorDeps`, enforcing immutability at the type level.
