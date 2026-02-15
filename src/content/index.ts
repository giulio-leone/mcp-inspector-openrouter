/**
 * Content script entry — thin orchestrator.
 *
 * Wires together ToolRegistry, message handling, SPA detection,
 * custom page events, and the LiveState polling engine.
 */

import { ToolRegistry } from './tool-registry';
import { createMessageHandler } from './message-handler';
import { initSpaDetection } from './spa-detector';
import {
  getLiveStateManager,
  PollingEngine,
  MediaStateProvider,
  FormStateProvider,
  NavigationStateProvider,
  AuthStateProvider,
  InteractiveStateProvider,
  VisibilityStateProvider,
} from './live-state';

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

  // ── LiveState polling ──
  const liveManager = getLiveStateManager();
  liveManager.registerProvider(new MediaStateProvider());
  liveManager.registerProvider(new FormStateProvider());
  liveManager.registerProvider(new NavigationStateProvider());
  liveManager.registerProvider(new AuthStateProvider());
  liveManager.registerProvider(new InteractiveStateProvider());
  liveManager.registerProvider(new VisibilityStateProvider());

  const pollingEngine = new PollingEngine(liveManager, {
    pollingIntervalMs: 1000,
    activePollingIntervalMs: 200,
    enabled: true,
  });
  liveManager.start();
  pollingEngine.start();

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
