---
sidebar_position: 3
---

# IToolExecutionPort

Abstracts tool routing across Chrome tabs, background scripts, and local handlers. Supports dynamic tool discovery.

## Interface

```typescript
export interface IToolExecutionPort {
  execute(
    toolName: string,
    args: Record<string, unknown>,
    target: ToolTarget,
  ): Promise<ToolCallResult>;

  getAvailableTools(tabId: number): Promise<readonly ToolDefinition[]>;

  onToolsChanged(callback: (tools: readonly ToolDefinition[]) => void): () => void;
}
```

## Methods

### `execute(toolName, args, target)`

Executes a named tool with arguments on a specific tab.

| Parameter | Type | Description |
|-----------|------|-------------|
| `toolName` | `string` | Tool identifier (e.g., `media.play`, `click`) |
| `args` | `Record<string, unknown>` | Tool-specific arguments |
| `target` | `ToolTarget` | Target tab and origin tab IDs |

**Returns:** `Promise<ToolCallResult>` — Success/failure with data.

### `getAvailableTools(tabId)`

Discovers tools available on the specified tab by querying the content script.

### `onToolsChanged(callback)`

Subscribes to tool list changes (e.g., after page navigation). Returns an unsubscribe function.

## Types

```typescript
interface ToolTarget {
  tabId: number;
  originTabId?: number;
}

interface ToolCallResult {
  success: boolean;
  data: unknown;
  error?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  category?: string;
}
```

## Adapter: ChromeToolAdapter

Routes tools via `chrome.tabs.sendMessage` (content script tools) or `chrome.runtime.sendMessage` (background tools). Handles cross-tab focusing for multi-tab operations.
