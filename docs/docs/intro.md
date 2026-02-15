---
sidebar_position: 1
slug: /
---

# OneGenUI Deep Agents

**AI-powered Chrome Extension with hexagonal architecture for browser automation.**

OneGenUI Deep Agents is a Chrome Extension that uses an AI agent orchestrator to automate browser interactions with full context awareness. It understands what's on the page — playing videos, form states, overlays, navigation — and acts accordingly.

## What is OneGenUI Deep Agents?

OneGenUI Deep Agents is a Chrome extension that brings AI-powered browser automation to your fingertips. It connects to AI models (via OpenRouter, Claude, and others) and executes browser actions on your behalf — clicking buttons, filling forms, navigating pages, and managing multi-tab workflows — all while maintaining real-time awareness of the page state.

The extension is built on a **hexagonal architecture** (ports & adapters) that cleanly separates domain logic from infrastructure, making it easy to swap AI providers, add platform-specific adapters, or extend with new capabilities.

## Key Features

- **🏗️ Hexagonal Architecture** — 13+ ports isolate domain from infrastructure
- **🔄 LiveState Context** — Real-time awareness of media, forms, overlays, and navigation
- **📋 Structured Planning** — Step-by-step plans with progress tracking and failure handling
- **🤖 Subagent Delegation** — Parallel child agents with depth/concurrency limits
- **📑 Multi-Tab Sessions** — Cross-tab context with `@mention` syntax
- **💾 WebMCP Cache** — Persistent IndexedDB caching of tool manifests
- **🔐 Approval Gate** — Tiered security for tool execution

## Installation

```bash
git clone https://github.com/giulio-leone/mcp-inspector-openrouter.git
cd mcp-inspector-openrouter
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

## Quick Start

1. Open the extension popup by clicking the OneGenUI icon in your toolbar
2. Select an AI model (OpenRouter, Claude, etc.) in the settings
3. Type a command like _"Click the sign-in button"_ or _"Fill out this form with my info"_
4. Watch the agent plan and execute the steps in real time

For a deeper understanding of the system, see the [Architecture Overview](./architecture/overview).
