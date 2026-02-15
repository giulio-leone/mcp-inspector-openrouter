/**
 * LiveState type definitions for real-time page state awareness.
 *
 * Defines category-specific state interfaces, the aggregated snapshot,
 * the generic provider contract, and manager configuration.
 */

// ── Category State Interfaces ──

/** Live state for media players (video/audio) on the page */
export interface MediaLiveState {
  readonly playerId: string;
  readonly platform: string;
  readonly title: string;
  readonly paused: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly fullscreen: boolean;
  readonly captions: boolean;
  readonly playbackRate: number;
  readonly hasPlaylist: boolean;
  readonly playlistIndex?: number;
  readonly playlistLength?: number;
}

/** Per-field detail for form field recognition */
export interface FormFieldDetail {
  readonly name: string;
  readonly label: string;
  readonly type: string;
  readonly value: string;
  readonly filled: boolean;
  readonly required: boolean;
  readonly valid: boolean;
  readonly options?: readonly string[];
}

/** Live state for a tracked form on the page */
export interface FormLiveState {
  readonly formId: string;
  readonly toolName: string;
  readonly totalFields: number;
  readonly filledFields: number;
  readonly dirtyFields: readonly string[];
  readonly hasValidationErrors: boolean;
  readonly completionPercent: number;
  readonly fields: readonly FormFieldDetail[];
}

/** Live state for page navigation / scroll position */
export interface NavigationLiveState {
  readonly currentUrl: string;
  readonly scrollPercent: number;
  readonly visibleSection?: string;
  readonly activeTab?: string;
  readonly breadcrumb?: readonly string[];
}

/** Live state for authentication indicators */
export interface AuthLiveState {
  readonly isLoggedIn: boolean;
  readonly userName?: string;
  readonly hasLoginForm: boolean;
  readonly hasLogoutButton: boolean;
}

/** Live state for interactive UI widgets */
export interface InteractiveLiveState {
  readonly openModals: readonly string[];
  readonly expandedAccordions: readonly string[];
  readonly openDropdowns: readonly string[];
  readonly activeTooltips: readonly string[];
  readonly visibleNotifications: readonly string[];
}

/** Live state for DOM visibility context (overlays, loading indicators) */
export interface VisibilityLiveState {
  readonly overlays: readonly string[];
  readonly loadingIndicators: boolean;
}

// ── Union / Aggregate Types ──

/** Union of all category-specific live states */
export type CategoryLiveState =
  | MediaLiveState
  | FormLiveState
  | NavigationLiveState
  | AuthLiveState
  | InteractiveLiveState
  | VisibilityLiveState;

/** Aggregated snapshot of the entire page's live state */
export interface LiveStateSnapshot {
  readonly timestamp: number;
  readonly media: readonly MediaLiveState[];
  readonly forms: readonly FormLiveState[];
  readonly navigation: NavigationLiveState;
  readonly auth: AuthLiveState;
  readonly interactive: InteractiveLiveState;
  readonly visibility: VisibilityLiveState;
}

// ── Category Enum ──

/** Live state category identifiers (mirrors relevant ToolCategory values) */
export type LiveStateCategory =
  | 'media'
  | 'form'
  | 'navigation'
  | 'auth'
  | 'interactive'
  | 'visibility';

// ── Provider Interface ──

/** Generic provider that collects live state for a single category (ISP) */
export interface IStateProvider<T> {
  readonly category: LiveStateCategory;
  collect(root: Document | Element): T[] | T;
  dispose(): void;
}

// ── Manager Config ──

/** Configuration for the LiveStateManager */
export interface LiveStateManagerConfig {
  readonly pollingIntervalMs: number;
  readonly activePollingIntervalMs: number;
  readonly enabled: boolean;
}
