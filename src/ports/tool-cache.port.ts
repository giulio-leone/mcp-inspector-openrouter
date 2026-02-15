/**
 * IToolCachePort — Port for persistent tool manifest caching.
 *
 * Stores per-site WebMCP manifests with URL pattern matching and
 * incremental diff updates. Eliminates redundant DOM scanning for
 * previously visited pages.
 */

import type { CleanTool } from '../types';

/** A cached page entry within a site manifest */
export interface CachedPage {
  /** URL pattern (e.g., "/watch?v=*") */
  readonly pattern: string;
  /** Cached tools for this page pattern */
  readonly tools: readonly CleanTool[];
  /** Hash of serialized tools for diff comparison */
  readonly hash: string;
  /** Last scan timestamp */
  readonly scannedAt: number;
}

/** Site-level WebMCP manifest stored in IndexedDB */
export interface SiteManifest {
  /** Site origin (e.g., "youtube.com") */
  readonly site: string;
  /** Manifest schema version */
  readonly version: number;
  /** Timestamp of last full scan */
  readonly lastFullScan: number;
  /** Page-level tool caches keyed by URL pattern */
  readonly pages: Record<string, CachedPage>;
}

/** Diff result from comparing cached vs live tools */
export interface ToolDiff {
  readonly added: readonly CleanTool[];
  readonly removed: readonly string[];
  readonly changed: readonly CleanTool[];
  readonly unchanged: number;
}

export interface IToolCachePort {
  /** Get cached tools for a URL. Returns null on cache miss. */
  get(site: string, url: string): Promise<readonly CleanTool[] | null>;

  /** Store tools for a URL, updating the site manifest incrementally. */
  put(site: string, url: string, tools: readonly CleanTool[]): Promise<void>;

  /** Get the full site manifest. */
  getManifest(site: string): Promise<SiteManifest | null>;

  /** Compute diff between cached and live tools for a URL. */
  diff(site: string, url: string, liveTools: readonly CleanTool[]): Promise<ToolDiff>;

  /** Apply a diff to update the cache (merge only changed/added, remove deleted). */
  applyDiff(site: string, url: string, diff: ToolDiff): Promise<void>;

  /** Invalidate cache for a specific URL pattern. */
  invalidate(site: string, url: string): Promise<void>;

  /** Invalidate the entire site manifest. */
  invalidateSite(site: string): Promise<void>;

  /** Clear all cached manifests. */
  clear(): Promise<void>;
}
