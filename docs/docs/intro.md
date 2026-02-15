---
sidebar_position: 1
slug: /
---

# OneGenUI Deep Agents

**AI-powered Chrome Extension with hexagonal architecture for browser automation.**

OneGenUI Deep Agents is a Chrome Extension that uses an AI agent orchestrator to automate browser interactions with full context awareness. It understands what's on the page — playing videos, form states, overlays, navigation — and acts accordingly.

## Key Features

- **🏗️ Hexagonal Architecture** — 5 stable ports isolate domain from infrastructure. Swap AI engines or tool implementations without touching business logic.
- **🔄 LiveState Context** — Real-time awareness of media playback, form completion, overlays, loading indicators, and navigation state.
- **📋 Structured Planning** — AI creates step-by-step plans with progress tracking, failure handling, and status updates.
- **🤖 Subagent Delegation** — Complex tasks are split across child agents with configurable depth, concurrency, and timeout limits.
- **📑 Multi-Tab Sessions** — Cross-tab context with `@mention` syntax for referencing data between tabs.
- **🎬 Media Control** — YouTube, Vimeo, Twitch, Dailymotion, Spotify, SoundCloud with state-aware playback control.
- **📱 Social Platform Support** — Instagram, Twitter/X, Facebook, LinkedIn, TikTok, Reddit action detection.
- **🛒 E-commerce** — Product pages, add-to-cart, quantity management via generic selectors.
- **🔐 Security Approval Gate** — Tiered security for tool execution: auto-approve safe tools, prompt for sensitive ones.

## Architecture at a Glance

```
┌─────────────────────────────────────────────┐
│              AI Chat Controller             │
├─────────────────────────────────────────────┤
│            AgentOrchestrator                │
│  ┌─────────┬──────────┬──────────┬────────┐ │
│  │ IAgent  │  ITool   │IPlanning │IContext│ │
│  │  Port   │  Port    │  Port    │  Port  │ │
│  └────┬────┴────┬─────┴────┬─────┴───┬────┘ │
│       │         │          │         │      │
│  Orchestr.  ChromeTool  Planning  Context   │
│  Adapter    Adapter     Adapter   Adapter   │
├─────────────────────────────────────────────┤
│        Chrome Extension APIs                │
└─────────────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/giulio-leone/mcp-inspector-openrouter.git
cd mcp-inspector-openrouter
npm install
npm run build
```

Then load the `dist/` folder as an unpacked extension in Chrome.
