/**
 * Content script entry — thin orchestrator.
 *
 * Wires together ToolRegistry, message handling, SPA detection,
 * and custom page events.
 */

import { ToolRegistry } from './tool-registry';
import { createMessageHandler } from './message-handler';
import { initSpaDetection } from './spa-detector';

// ── Guard against duplicate injection ──
if (window.__wmcp_loaded) {
  console.debug('[WebMCP] Content script already loaded, skipping');
} else {
  window.__wmcp_loaded = true;
  console.debug('[WebMCP] Content script injected');

  const registry = new ToolRegistry();

  createMessageHandler(registry);

  initSpaDetection(() => {
    registry.invalidateCache();
    registry.listToolsAlwaysAugment();
  });

  // ── Custom events from the page ──
  window.addEventListener('toolactivated', ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.debug(
      `[WebMCP] Tool "${detail?.toolName ?? ''}" started execution.`,
    );
  }) as EventListener);

  window.addEventListener('toolcancel', ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    console.debug(
      `[WebMCP] Tool "${detail?.toolName ?? ''}" execution is cancelled.`,
    );
  }) as EventListener);
}
