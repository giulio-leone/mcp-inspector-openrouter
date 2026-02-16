---
sidebar_position: 14
---

# WebMCP Server

The WebMCP Server exposes auto-generated tool manifests to the page, enabling external MCP clients to discover and invoke browser-side tools.

## DOM Injection

The manifest is injected into the page as a script element:

```html
<script type="application/wmcp+json" id="wmcp-manifest">
{
  "_meta": {
    "origin": "https://example.com",
    "version": 3,
    "generatedAt": 1736935200000,
    "pageCount": 1,
    "toolCount": 5
  },
  "tools": [...]
}
</script>
```

The element is created or updated by `ToolManifestAdapter` whenever the manifest changes. The element has `id="wmcp-manifest"` for easy retrieval:

```typescript
const el = document.getElementById('wmcp-manifest');
const manifest = JSON.parse(el?.textContent ?? 'null');
```

## CustomEvent Request/Response Protocol

Clients communicate with the WebMCP server via `CustomEvent` dispatched on `document`:

### Request

```typescript
// Full site manifest
document.dispatchEvent(new CustomEvent('wmcp-request', {
  detail: {}   // omit url for complete manifest
}));

// Page-specific tools
document.dispatchEvent(new CustomEvent('wmcp-request', {
  detail: {
    url: '/products/123'   // returns only tools for this URL
  }
}));
```

When a `url` is provided, the server returns a filtered response with only tools available on that specific page (via `getToolsForUrl()`). When omitted, the full site manifest is returned.

### Response

The server responds with a `wmcp-response` event. The handler registered via `onRequest(handler)` receives the URL and returns the manifest string:

```typescript
document.addEventListener('wmcp-response', (e: CustomEvent) => {
  const { manifest } = e.detail;   // manifest JSON string
});
```

## IndexedDB Persistence

Manifests are persisted to IndexedDB for instant availability on page load:

- **Database**: `webmcp-manifest-persistence`
- **Object store**: `wmcp_manifests`
- **Key**: site origin (e.g. `https://example.com`)
- **Value**: full `SiteToolManifest` object

On page load, the adapter restores the cached manifest from IndexedDB and injects it into the DOM before any new scan runs. Incremental diffs update both the in-memory manifest and the persisted copy. Tools loaded from the persisted manifest are tagged with `_source: 'manifest'` to distinguish them from freshly scanned tools.

## Tool Source Badges

The Tools tab displays source badges for each discovered tool:

| Badge | Source | Description |
|-------|--------|-------------|
| 🟢 Native | `native` | From site's native MCP API |
| 🔵 Declarative | `declarative` | From HTML `data-*` attributes |
| 🟡 Inferred | `inferred` | From DOM scanner inference |
| 🟣 AI | `ai` | AI-refined tool definition |
| 🟠 Manifest | `manifest` | Loaded from persisted JSON manifest |

## Manifest Archive Export

The Tools tab includes an **Export Manifest Archive** button that downloads the current site's manifest as a JSON file (`wmcp-manifest-{hostname}.json`). This enables:

- Sharing tool definitions between team members
- Importing manifests into external MCP servers
- Auditing and versioning tool schemas

## Manifest Dashboard

A sidebar component provides a visual overview of discovered manifests:

- Lists all origins with cached manifests
- Shows tool count per origin and per page
- Allows manual refresh or clearing of individual manifests
- Displays the raw JSON for inspection

The dashboard is rendered as part of the extension popup and reads directly from the `wmcp_manifests` IndexedDB store.
