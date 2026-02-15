/**
 * ToolManifestAdapter — Thin wrapper around OneCrawl's SemanticScrapingAdapter.
 *
 * Adapts CleanTool (Chrome extension–specific) ↔ SemanticTool (generic)
 * while delegating all manifest logic to the shared OneCrawl implementation.
 */

import type {
  IToolManifestPort,
  SiteToolManifest,
  ManifestTool,
} from '../ports/tool-manifest.port';
import type { CleanTool } from '../types';
import {
  SemanticScrapingAdapter,
  type SemanticTool,
} from 'onegenui-deep-agents';

/** Convert a CleanTool to a SemanticTool for the shared adapter. */
function toSemanticTool(tool: CleanTool): SemanticTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    category: tool.category,
    annotations: tool.annotations
      ? { ...tool.annotations }
      : undefined,
  };
}

export class ToolManifestAdapter implements IToolManifestPort {
  private readonly inner = new SemanticScrapingAdapter();

  getManifest(origin: string): SiteToolManifest | null {
    return this.inner.getManifest(origin);
  }

  updatePage(origin: string, url: string, tools: CleanTool[]): SiteToolManifest {
    return this.inner.updatePage(origin, url, tools.map(toSemanticTool));
  }

  applyDiff(origin: string, url: string, added: CleanTool[], removed: string[]): SiteToolManifest {
    return this.inner.applyDiff(origin, url, added.map(toSemanticTool), removed);
  }

  toMCPJson(origin: string): string {
    return this.inner.toMCPJson(origin);
  }

  getToolsForUrl(origin: string, url: string): ManifestTool[] {
    return this.inner.getToolsForUrl(origin, url);
  }
}
