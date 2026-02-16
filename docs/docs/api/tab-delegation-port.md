---
sidebar_position: 15
---

# ITabDelegationPort

The Tab Delegation Port enables Agent-to-Agent (A2A) delegation between browser tabs based on skill matching. This allows agents to discover and delegate tasks to other tabs with specialized capabilities.

## Interface Overview

```typescript
export interface ITabDelegationPort {
  registerTab(tabId: number, url: string, title: string, skills: string[]): void;
  unregisterTab(tabId: number): void;
  findTabForTask(requiredSkills: string[], excludeTabId?: number): TabAgent | null;
  delegate(
    sourceTabId: number,
    targetTabId: number,
    taskDescription: string,
  ): Promise<TabDelegationResult>;
  listRegisteredTabs(): readonly TabAgent[];
}
```

## Types

### TabAgent

Represents a registered tab with its capabilities:

```typescript
export interface TabAgent {
  readonly tabId: number;
  readonly url: string;
  readonly title: string;
  readonly skills: readonly string[];
}
```

### TabDelegationResult

Result of a delegation operation:

```typescript
export interface TabDelegationResult {
  readonly sourceTabId: number;
  readonly targetTabId: number;
  readonly taskDescription: string;
  readonly status: 'completed' | 'failed';
  readonly result?: unknown;
  readonly error?: string;
  readonly durationMs: number;
}
```

## Skill Detection

The system automatically detects tab capabilities using the `detectSkills()` function with a comprehensive platform mapping:

| Platform | Skills | Confidence |
|----------|--------|------------|
| youtube.com | video, media, playback, comments, subscribe | 1.0 |
| gmail.com | email, compose, inbox, search | 1.0 |
| docs.google.com | document, edit, format, share | 1.0 |
| sheets.google.com | spreadsheet, data, formula, chart | 1.0 |
| slides.google.com | presentation, slides, design | 1.0 |
| drive.google.com | files, storage, share | 1.0 |
| calendar.google.com | calendar, events, schedule | 1.0 |
| github.com | code, repository, pullrequest, issues | 1.0 |
| notion.so | notes, database, wiki, tasks | 1.0 |
| trello.com | kanban, cards, tasks, boards | 1.0 |
| slack.com | messaging, channels, threads | 1.0 |
| twitter.com / x.com | social, posts, timeline, messages | 1.0 |
| linkedin.com | professional, network, jobs, posts | 1.0 |
| reddit.com | forum, posts, comments, communities | 1.0 |
| instagram.com | social, photos, stories, reels | 1.0 |
| amazon.com | shopping, products, cart, reviews | 1.0 |
| *.myshopify.com/admin | ecommerce, products, orders, inventory | 1.0 |
| (unknown) | browse, navigate, interact | 0.5 |

The skill detector also handles:
- Subdomain matching with reduced confidence (0.8)
- Shopify admin detection (`*.myshopify.com/admin`) for ecommerce capabilities
- Fallback to basic browsing skills for unknown platforms

## delegate_to_tab Tool

The system exposes a `delegate_to_tab` tool that:
- Finds tabs with required skills
- Prevents self-delegation (excludes current tab)
- Executes delegation with error handling
- Returns detailed results including timing

## Self-Delegation Prevention

The system prevents infinite loops by automatically excluding the source tab ID when searching for delegation targets, ensuring agents cannot delegate tasks to themselves.