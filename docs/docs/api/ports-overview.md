---
sidebar_position: 1
---

# Ports Overview

The hexagonal architecture defines **key port interfaces** that decouple the domain from infrastructure. Each port is a TypeScript interface in `src/ports/`. The table below shows a curated subset of the most commonly used ports.

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
| [`ITabDelegationPort`](./tab-delegation-port) | `tab-delegation.port.ts` | Agent-to-Agent (A2A) tab delegation |
| [`IWmcpServerPort`](./wmcp-server) | `wmcp-server.port.ts` | WebMCP manifest injection and event protocol |

## Dependency Flow

```
AIChatController
    └─ AgentOrchestrator (implements IAgentPort)
        ├─ IToolExecutionPort   → ChromeToolAdapter
        ├─ IPlanningPort        → PlanningAdapter
        ├─ ISubagentPort        → SubagentAdapter
        ├─ IContextPort         → ChromeContextAdapter
        ├─ IContextManagerPort  → ContextManagerAdapter
        ├─ ITabSessionPort      → TabSessionAdapter
        └─ ITabDelegationPort   → TabDelegationAdapter
```

All ports are defined as `readonly` properties in `OrchestratorDeps`, enforcing immutability at the type level.

## Workflow & A2A

The orchestrator supports multi-step workflows through `IPlanningPort` and agent-to-agent (A2A) tab delegation via `ITabDelegationPort`. Workflow plans are decomposed into steps, each executed through the appropriate port. Child agent spawning is handled by `ISubagentPort`, enabling complex cross-platform automation sequences.
