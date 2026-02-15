---
sidebar_position: 1
---

# Ports Overview

The hexagonal architecture defines **20+ stable port interfaces** that decouple the domain from infrastructure. Each port is a TypeScript interface in `src/ports/`.

## Port Summary

| Port | File | Purpose |
|------|------|---------|
| [`IAgentPort`](./agent-port) | `agent.port.ts` | AI orchestration entry point |
| [`IToolExecutionPort`](./tool-execution-port) | `tool-execution.port.ts` | Browser action execution |
| [`IPlanningPort`](./planning-port) | `planning.port.ts` | Plan lifecycle management |
| [`ISubagentPort`](./subagent-port) | `subagent.port.ts` | Child agent delegation |
| [`IContextPort`](./context-port) | `context.port.ts` | Page context and LiveState |
| [`IToolCachePort`](./tool-cache-port) | `tool-cache.port.ts` | WebMCP tool manifest caching |
| [`ICrawlerPort`](./crawler-port) | `crawler.port.ts` | Semantic site crawling |
| [`IInstagramPort`](./instagram-port) | `instagram.port.ts` | Instagram DOM operations |
| [`IEcommercePort`](./ecommerce-port) | `ecommerce.port.ts` | E-commerce (Shopify, WooCommerce, Wix, Webflow) |
| [`IProductivityPort`](./productivity-port) | `productivity.port.ts` | Notion, GitHub, Google Docs, Trello, Slack |
| [`IToolManifestPort`](./tool-manifest-port) | `tool-manifest.port.ts` | Auto-generated MCP tool manifests |
| [`IGesturePort`](./gesture-port) | `gesture.port.ts` | Touch gesture simulation |
| [`IWmcpServerPort`](./wmcp-server) | `wmcp-server.port.ts` | WebMCP manifest injection and event protocol |

## Dependency Flow

```
AIChatController
    └─ AgentOrchestrator (implements IAgentPort)
        ├─ IToolExecutionPort  → ChromeToolAdapter
        ├─ IPlanningPort       → PlanningAdapter
        ├─ ISubagentPort       → SubagentAdapter
        ├─ IContextPort        → ChromeContextAdapter
        ├─ IToolCachePort      → IndexedDBToolCacheAdapter
        ├─ ICrawlerPort        → SemanticCrawlerAdapter
        └─ IInstagramPort      → InstagramAdapter
```

All ports are defined as `readonly` properties in `OrchestratorDeps`, enforcing immutability at the type level.

## Workflow & A2A

The orchestrator supports multi-step workflows through `IPlanningPort` and agent-to-agent (A2A) delegation via `ISubagentPort`. Workflow plans are decomposed into steps, each executed through the appropriate port, enabling complex cross-platform automation sequences.
