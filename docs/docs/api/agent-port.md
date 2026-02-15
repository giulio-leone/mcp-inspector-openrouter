---
sidebar_position: 2
---

# IAgentPort

The primary entry point for running an AI agent. Wraps specific AI frameworks and returns structured results.

## Interface

```typescript
export interface IAgentPort {
  run(prompt: string | ContentPart[], context: AgentContext): Promise<AgentResult>;
  dispose(): Promise<void>;
}
```

## Methods

### `run(prompt, context)`

Executes the agent with the given prompt and context. Returns when the AI has finished processing (including all tool calls).

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string \| ContentPart[]` | User message or multimodal content |
| `context` | `AgentContext` | Page context, tools, history, LiveState |

**Returns:** `Promise<AgentResult>`

### `dispose()`

Cleans up resources (chat instance, event listeners). Safe to call multiple times.

## Types

### AgentContext

```typescript
interface AgentContext {
  pageContext: PageContext | null;
  tools: readonly CleanTool[];
  conversationHistory?: readonly Message[];
  liveState: LiveStateSnapshot | null;
  tabId: number;
  mentionContexts?: MentionContext[];
}
```

### AgentResult

```typescript
interface AgentResult {
  text: string;
  reasoning?: string;
  toolCalls: readonly ToolCallRecord[];
  updatedTools: readonly ToolDefinition[];
  updatedPageContext: PageContext | null;
  stepsCompleted: number;
}
```

## Adapter: AgentOrchestrator

The default implementation wires all other ports together in a tool-loop pattern:

```typescript
const orchestrator = new AgentOrchestrator({
  toolPort: chromeToolAdapter,
  contextPort: chromeContextAdapter,
  planningPort: planningAdapter,
  subagentPort: subagentAdapter,
  tabSession: tabSessionAdapter,
  limits: { maxIterations: 20, loopTimeoutMs: 120_000 },
  chatFactory: () => new OpenRouterChat(apiKey, model),
  buildConfig: (ctx, tools) => buildChatConfig(ctx, tools),
});

const result = await orchestrator.run('Click the login button', context);
```
