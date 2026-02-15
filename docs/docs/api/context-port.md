---
sidebar_position: 6
---

# IContextPort

Bridges page context, LiveState snapshots, and conversation history for agent decision-making.

## Interface

```typescript
export interface IContextPort {
  getPageContext(tabId: number): Promise<PageContext | null>;
  getLiveState(): LiveStateSnapshot | null;
  getConversationHistory(): readonly Message[];
  summarizeIfNeeded(
    messages: readonly Message[],
    tokenBudget: number,
  ): Promise<ContextSummary>;
}
```

## Methods

| Method | Description |
|--------|-------------|
| `getPageContext(tabId)` | Fetches DOM snapshot, URL, title, and LiveState for a tab |
| `getLiveState()` | Returns the last collected LiveState snapshot |
| `getConversationHistory()` | Returns conversation messages for the current session |
| `summarizeIfNeeded(messages, budget)` | Compresses history to fit within token budget |

## LiveState Snapshot

```typescript
interface LiveStateSnapshot {
  timestamp: number;
  media: MediaLiveState[];
  forms: FormLiveState[];
  navigation: NavigationLiveState;
  auth: AuthLiveState;
  interactive: InteractiveLiveState;
  visibility: VisibilityLiveState;
}
```

### Media State
```typescript
interface MediaLiveState {
  type: 'video' | 'audio';
  src: string;
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  platform?: string; // 'youtube', 'vimeo', etc.
}
```

### Form State
```typescript
interface FormLiveState {
  id: string;
  action: string;
  fields: FormFieldDetail[];
  completionPercent: number;
  validationErrors: string[];
}
```

### Visibility State
```typescript
interface VisibilityLiveState {
  overlays: OverlayInfo[];
  loadingIndicators: boolean;
}
```

## Adapter: ChromeContextAdapter

Communicates with the content script to collect page context and LiveState. Configurable via:

```typescript
const contextAdapter = new ChromeContextAdapter({
  site: 'example.com',
  conversationId: 'conv_123',
});
```
