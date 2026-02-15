/**
 * LiveStateManager — singleton orchestrator for live page state collection.
 *
 * Registers IStateProvider instances, collects snapshots on demand,
 * and caches the latest result. Polling is deferred to Phase 3.
 */

import type {
  IStateProvider,
  LiveStateCategory,
  LiveStateSnapshot,
  MediaLiveState,
  FormLiveState,
  NavigationLiveState,
  AuthLiveState,
  InteractiveLiveState,
  VisibilityLiveState,
} from '../../types/live-state.types';

/** Default navigation state when no provider is registered */
const DEFAULT_NAVIGATION: NavigationLiveState = {
  currentUrl: '',
  scrollPercent: 0,
};

/** Default auth state when no provider is registered */
const DEFAULT_AUTH: AuthLiveState = {
  isLoggedIn: false,
  hasLoginForm: false,
  hasLogoutButton: false,
};

/** Default interactive state when no provider is registered */
const DEFAULT_INTERACTIVE: InteractiveLiveState = {
  openModals: [],
  expandedAccordions: [],
  openDropdowns: [],
  activeTooltips: [],
  visibleNotifications: [],
};

/** Default visibility state when no provider is registered */
const DEFAULT_VISIBILITY: VisibilityLiveState = {
  overlays: [],
  loadingIndicators: false,
};

/**
 * Orchestrates live-state collection across all registered providers.
 * Use `getLiveStateManager()` to obtain the singleton instance.
 */
export class LiveStateManager {
  private readonly providers: IStateProvider<unknown>[] = [];
  private latestSnapshot: LiveStateSnapshot | null = null;
  private running = false;

  /** Register a provider for a specific live-state category */
  registerProvider(provider: IStateProvider<unknown>): void {
    this.providers.push(provider);
  }

  /** Return the first registered provider matching a given category */
  getProviderByCategory(category: LiveStateCategory): IStateProvider<unknown> | undefined {
    return this.providers.find((p) => p.category === category);
  }

  /** Synchronously collect a full snapshot from all registered providers */
  collectSnapshot(root: Document | Element = document): LiveStateSnapshot {
    let media: readonly MediaLiveState[] = [];
    let forms: readonly FormLiveState[] = [];
    let navigation: NavigationLiveState = DEFAULT_NAVIGATION;
    let auth: AuthLiveState = DEFAULT_AUTH;
    let interactive: InteractiveLiveState = DEFAULT_INTERACTIVE;
    let visibility: VisibilityLiveState = DEFAULT_VISIBILITY;

    for (const provider of this.providers) {
      const result = provider.collect(root);

      switch (provider.category) {
        case 'media':
          media = Array.isArray(result)
            ? (result as MediaLiveState[])
            : [result as MediaLiveState];
          break;
        case 'form':
          forms = Array.isArray(result)
            ? (result as FormLiveState[])
            : [result as FormLiveState];
          break;
        case 'navigation':
          navigation = (
            Array.isArray(result) ? result[0] ?? DEFAULT_NAVIGATION : result
          ) as NavigationLiveState;
          break;
        case 'auth':
          auth = (
            Array.isArray(result) ? result[0] ?? DEFAULT_AUTH : result
          ) as AuthLiveState;
          break;
        case 'interactive':
          interactive = (
            Array.isArray(result) ? result[0] ?? DEFAULT_INTERACTIVE : result
          ) as InteractiveLiveState;
          break;
        case 'visibility':
          visibility = (
            Array.isArray(result) ? result[0] ?? DEFAULT_VISIBILITY : result
          ) as VisibilityLiveState;
          break;
      }
    }

    const snapshot: LiveStateSnapshot = {
      timestamp: Date.now(),
      media,
      forms,
      navigation,
      auth,
      interactive,
      visibility,
    };

    this.latestSnapshot = snapshot;
    return snapshot;
  }

  /** Return the most recently collected snapshot, or null if none exists */
  getLatestSnapshot(): LiveStateSnapshot | null {
    return this.latestSnapshot;
  }

  /** Mark the manager as running (polling deferred to Phase 3) */
  start(): void {
    this.running = true;
  }

  /** Stop the manager */
  stop(): void {
    this.running = false;
  }

  /** Whether the manager is currently running */
  isRunning(): boolean {
    return this.running;
  }

  /** Dispose all providers and reset internal state */
  dispose(): void {
    this.stop();
    for (const provider of this.providers) {
      provider.dispose();
    }
    this.providers.length = 0;
    this.latestSnapshot = null;
  }
}

// ── Singleton ──

let instance: LiveStateManager | null = null;

/** Get (or create) the singleton LiveStateManager instance */
export function getLiveStateManager(): LiveStateManager {
  if (!instance) {
    instance = new LiveStateManager();
  }
  return instance;
}
