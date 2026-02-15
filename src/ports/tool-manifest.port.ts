/**
 * IToolManifestPort — Port for derived MCP JSON tool manifests.
 *
 * Produces a cross-page, deduplicated tool manifest in MCP-compatible
 * JSON format. Built incrementally from DOM scanner results and
 * persisted per-site across page loads.
 */

import type { CleanTool } from '../types';

/** A single tool entry in the site manifest */
export interface ManifestTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly category?: string;
  readonly annotations?: Record<string, boolean>;
  /** URL patterns where this tool was discovered */
  readonly pagePatterns: readonly string[];
}

/** Tools discovered on a specific page pattern */
export interface PageToolSet {
  /** Normalized URL pattern (e.g., "/watch?v=*") */
  readonly urlPattern: string;
  /** Tool names referencing SiteToolManifest.tools */
  readonly tools: readonly string[];
  /** Timestamp of last scan */
  readonly lastScanned: number;
  /** Hash for quick change detection */
  readonly hash: string;
}

/** Complete per-site tool manifest */
export interface SiteToolManifest {
  readonly origin: string;
  readonly version: number;
  readonly generatedAt: number;
  /** Page-level tool sets keyed by URL pattern */
  readonly pages: Record<string, PageToolSet>;
  /** Deduplicated cross-page tools */
  readonly tools: readonly ManifestTool[];
}

export interface IToolManifestPort {
  /** Get the current manifest for a site, or null if none exists. */
  getManifest(origin: string): SiteToolManifest | null;

  /** Add or replace all tools for a specific URL. Returns updated manifest. */
  updatePage(origin: string, url: string, tools: CleanTool[]): SiteToolManifest;

  /** Incrementally update tools for a URL. Returns updated manifest. */
  applyDiff(origin: string, url: string, added: CleanTool[], removed: string[]): SiteToolManifest;

  /** Export the manifest as MCP-compatible JSON string. */
  toMCPJson(origin: string): string;

  /** Get tools available on a specific URL. */
  getToolsForUrl(origin: string, url: string): ManifestTool[];
}
