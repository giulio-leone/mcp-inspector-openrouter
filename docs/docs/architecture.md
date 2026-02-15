---
sidebar_position: 3
---

# Architecture

OneGenUI Deep Agents uses **hexagonal architecture** (ports & adapters) to decouple the AI orchestration domain from browser-specific infrastructure.

## Design Principles

- **SOLID** — Each port has a single responsibility; adapters are open for extension
- **KISS** — Minimal interfaces, no over-engineering
- **DRY** — Shared types, reusable event bus, common patterns
- **Dependency Inversion** — Domain depends on port contracts, not on Chrome APIs

## Hexagonal Layers

```
┌──────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│   ChatInput · ChatHeader · ToolTable · PlanViewer           │
├──────────────────────────────────────────────────────────────┤
│                   Application Layer                          │
│           AIChatController · ConversationController          │
├──────────────────────────────────────────────────────────────┤
│                    Domain (Ports)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │ IAgent   │ │ ITool    │ │ IPlanning│ │ IContext         │ │
│  │ Port     │ │ Execution│ │ Port     │ │ Port             │ │
│  │          │ │ Port     │ │          │ │                   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────────────┘ │
│       │             │            │             │              │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴────────────┐ │
│  │ Agent    │ │ Chrome   │ │ Planning │ │ Chrome           │ │
│  │ Orchestr.│ │ Tool     │ │ Adapter  │ │ Context          │ │
│  │          │ │ Adapter  │ │          │ │ Adapter           │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                   Infrastructure                             │
│    Chrome Extension APIs · OpenRouter · Content Scripts      │
└──────────────────────────────────────────────────────────────┘
```

## The 5 Ports

| Port | Responsibility | Adapter |
|------|---------------|---------|
| `IAgentPort` | AI orchestration loop | `AgentOrchestrator` |
| `IToolExecutionPort` | Execute browser actions | `ChromeToolAdapter` |
| `IPlanningPort` | Plan CRUD + step tracking | `PlanningAdapter` |
| `ISubagentPort` | Child agent delegation | `SubagentAdapter` |
| `IContextPort` | Page context + LiveState | `ChromeContextAdapter` |

## LiveState System

The LiveState system provides **real-time page awareness** to the AI. Providers run in the content script and collect state every time the AI needs context.

### Providers

| Provider | What it collects |
|----------|-----------------|
| `MediaStateProvider` | Video/audio playback state, current time, duration, volume |
| `FormStateProvider` | Form completion %, field values, validation errors |
| `NavigationStateProvider` | URL, scroll position, visible section headings |
| `InteractiveStateProvider` | Open modals, dropdowns, accordions, notifications |
| `VisibilityStateProvider` | Cookie banners, overlays, loading spinners |
| `AuthStateProvider` | Login status, login/logout forms |

### How LiveState Feeds the AI

1. Content script collects `LiveStateSnapshot` from all providers
2. `formatLiveStateForPrompt()` converts to human-readable markdown
3. System instruction includes LiveState with awareness rules:
   - Don't play already-playing video → use `seek(0)` + `play`
   - Don't pause already-paused video
   - Check form completion before submitting
   - Dismiss overlays before interacting
   - Wait if page is loading

## Orchestrator Flow

```
User Prompt
    │
    ▼
AgentOrchestrator.run()
    │
    ├─ 1. Build ChatConfig with LiveState + tools
    ├─ 2. Send to OpenRouterChat (AI)
    │
    ▼
Tool Loop (max iterations configurable)
    │
    ├─ AI returns tool calls?
    │   ├─ Yes → Execute via IToolExecutionPort
    │   │         Update plan via IPlanningPort
    │   │         Store results in TabSession
    │   │         Send results back to AI
    │   │         Continue loop
    │   └─ No  → Return final text response
    │
    ├─ AI requests delegate_task?
    │   └─ Spawn via ISubagentPort
    │       Child agent gets own chat + no-op planning
    │
    └─ Timeout or max iterations?
        └─ Break with warning
```

## Event System

The orchestrator uses `TypedEventBus` for type-safe event emission:

```typescript
interface AgentEventMap {
  'tool:call': { name: string; args: Record<string, unknown> };
  'tool:result': { name: string; data: unknown; success: boolean };
  'tool:error': { name: string; error: string };
  'ai:response': { text: string; reasoning?: string };
  'navigation': { toolName: string };
  'subagent:start': { id: string; task: string };
  'subagent:complete': { id: string; result: string };
  'subagent:error': { id: string; error: string };
  'timeout': void;
  'max_iterations': void;
}
```
