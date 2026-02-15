---
sidebar_position: 2
---

# Getting Started

## Prerequisites

- **Chrome** or **Chrome Canary** (v120+)
- **Node.js** 18+
- **npm** 9+

## Installation

```bash
# Clone the repository
git clone https://github.com/giulio-leone/mcp-inspector-openrouter.git
cd mcp-inspector-openrouter

# Install dependencies
npm install

# Build the extension
npm run build
```

## Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder from the project root

## Open the Sidebar

1. Click the extension icon in the Chrome toolbar
2. The AI assistant opens as a **side panel**
3. You should see the chat input and tool table

## Configure API Key

1. Click the **⚙️ Settings** icon in the sidebar header
2. Enter your **OpenRouter API key**
3. Select your preferred model (default: `google/gemini-2.0-flash-001`)
4. Click **Save**

## First Test

1. Navigate to any website (e.g., `https://youtube.com`)
2. Type a command in the chat: `"Click the first video"`
3. The AI will:
   - Scan available tools on the page
   - Create a plan (if plan mode is enabled)
   - Execute the appropriate browser action
   - Report the result

## Development

```bash
# Run tests
npm run test

# Watch mode
npm run test -- --watch

# Lint
npm run lint
```

## Project Structure

```
src/
├── adapters/          # Hexagonal adapter implementations
├── components/        # Lit web components (sidebar UI)
├── content/           # Content scripts (injected into pages)
│   ├── executors/     # Tool executors (click, type, scroll, etc.)
│   ├── live-state/    # LiveState providers (media, forms, etc.)
│   ├── media/         # Media player abstractions
│   └── scanners/      # Page element scanners
├── ports/             # Hexagonal port interfaces (contracts)
├── services/          # External service adapters (OpenRouter)
├── sidebar/           # Sidebar entry point and controllers
├── types/             # Shared TypeScript types
└── utils/             # Utilities and helpers
```
