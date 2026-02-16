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
import { IndexedDBToolCacheAdapter, extractSite } from '../adapters/indexeddb-tool-cache-adapter';
import { ToolManifestAdapter } from '../adapters/tool-manifest-adapter';
import { ManifestPersistenceAdapter } from '../adapters/manifest-persistence-adapter';
import { WmcpServer } from './wmcp-server';

// ── Guard against duplicate injection ──
if (window.__wmcp_loaded) {
  console.debug('[WebMCP] Content script already loaded, skipping');
} else {
  window.__wmcp_loaded = true;
  console.debug('[WebMCP] Content script injected');

  const registry = new ToolRegistry();
  registry.setToolCache(new IndexedDBToolCacheAdapter());
  registry.setToolManifest(new ToolManifestAdapter());
  registry.setManifestPersistence(new ManifestPersistenceAdapter());

  // Restore persisted manifest for instant availability
  void registry.loadPersistedManifest();

  // ── WebMCP JSON server via DOM injection ──
  const wmcpServer = new WmcpServer();
  const site = extractSite(location.href);
  const manifestAdapter = registry.getToolManifest()!;

  wmcpServer.onRequest((url: string) => {
    if (url) {
      const tools = manifestAdapter.getToolsForUrl(site, url);
      return JSON.stringify({ origin: site, url, tools }, null, 2);
    }
    return manifestAdapter.toMCPJson(site);
  });
  registry.onManifestUpdate(() => {
    wmcpServer.exposeManifest(manifestAdapter.toMCPJson(site));
  });

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
