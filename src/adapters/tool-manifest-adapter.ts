/**
 * ToolManifestAdapter — In-memory IToolManifestPort implementation.
 *
 * Maintains per-site MCP tool manifests with:
 * - URL pattern normalization (query values → wildcards)
 * - Cross-page tool deduplication
 * - Incremental diff-based updates
 * - MCP-compatible JSON export
 */

import type {
  IToolManifestPort,
  SiteToolManifest,
  PageToolSet,
  ManifestTool,
} from '../ports/tool-manifest.port';
import type { CleanTool } from '../types';
import { urlToPattern, hashTools } from './indexeddb-tool-cache-adapter';

/** Parse a potentially stringified inputSchema into an object. */
function parseSchema(schema: string | Record<string, unknown> | object): Record<string, unknown> {
  if (typeof schema === 'string') {
    try { return JSON.parse(schema) as Record<string, unknown>; }
    catch { return { type: 'object', properties: {} }; }
  }
  return schema as Record<string, unknown>;
}

/** Convert a CleanTool to a ManifestTool with a single page pattern. */
function toManifestTool(tool: CleanTool, pattern: string): ManifestTool {
  const schema = parseSchema(tool.inputSchema);

  const annotations: Record<string, boolean> | undefined = tool.annotations
    ? { ...tool.annotations }
    : undefined;

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: schema,
    category: tool.category,
    annotations,
    pagePatterns: [pattern],
  };
}

/** Rebuild the deduplicated tools array from all page tool sets. */
function rebuildTools(
  pages: Record<string, PageToolSet>,
  toolsByName: Map<string, { tool: ManifestTool; patterns: Set<string> }>,
): readonly ManifestTool[] {
  // Collect which patterns each tool appears on
  const consolidated = new Map<string, { tool: ManifestTool; patterns: Set<string> }>();

  for (const [, entry] of toolsByName) {
    const existing = consolidated.get(entry.tool.name);
    if (existing) {
      for (const p of entry.patterns) existing.patterns.add(p);
    } else {
      consolidated.set(entry.tool.name, {
        tool: entry.tool,
        patterns: new Set(entry.patterns),
      });
    }
  }

  // Also verify against pages to drop tools that no longer appear on any page
  const activeToolNames = new Set<string>();
  for (const page of Object.values(pages)) {
    for (const name of page.tools) activeToolNames.add(name);
  }

  const result: ManifestTool[] = [];
  for (const [name, entry] of consolidated) {
    if (!activeToolNames.has(name)) continue;
    result.push({
      ...entry.tool,
      pagePatterns: [...entry.patterns].sort(),
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export class ToolManifestAdapter implements IToolManifestPort {
  private readonly manifests = new Map<string, {
    manifest: SiteToolManifest;
    toolIndex: Map<string, { tool: ManifestTool; patterns: Set<string> }>;
  }>();

  getManifest(origin: string): SiteToolManifest | null {
    return this.manifests.get(origin)?.manifest ?? null;
  }

  updatePage(origin: string, url: string, tools: CleanTool[]): SiteToolManifest {
    const pattern = urlToPattern(url);
    // Normalize confidence and inputSchema for consistent hashing
    const hash = hashTools(tools.map((t) => ({
      ...t,
      confidence: 0,
      inputSchema: parseSchema(t.inputSchema) as unknown as typeof t.inputSchema,
    })));
    const now = Date.now();

    const existing = this.manifests.get(origin);
    const toolIndex = existing?.toolIndex ?? new Map();
    const oldPages = existing?.manifest.pages ?? {};

    // Remove old tool entries for this pattern from the index
    const oldPage = oldPages[pattern];
    if (oldPage) {
      for (const toolName of oldPage.tools) {
        const entry = toolIndex.get(toolName);
        if (entry) {
          entry.patterns.delete(pattern);
          if (entry.patterns.size === 0) toolIndex.delete(toolName);
        }
      }
    }

    // Add new tools to the index
    const toolNames: string[] = [];
    for (const tool of tools) {
      toolNames.push(tool.name);
      const entry = toolIndex.get(tool.name);
      if (entry) {
        entry.patterns.add(pattern);
        // Update the tool data (latest scan wins)
        entry.tool = toManifestTool(tool, pattern);
      } else {
        toolIndex.set(tool.name, {
          tool: toManifestTool(tool, pattern),
          patterns: new Set([pattern]),
        });
      }
    }

    const pageToolSet: PageToolSet = {
      urlPattern: pattern,
      tools: toolNames,
      lastScanned: now,
      hash,
    };

    const pages: Record<string, PageToolSet> = { ...oldPages, [pattern]: pageToolSet };
    const deduped = rebuildTools(pages, toolIndex);

    const manifest: SiteToolManifest = {
      origin,
      version: (existing?.manifest.version ?? 0) + 1,
      generatedAt: now,
      pages,
      tools: deduped,
    };

    this.manifests.set(origin, { manifest, toolIndex });
    return manifest;
  }

  applyDiff(origin: string, url: string, added: CleanTool[], removed: string[]): SiteToolManifest {
    const pattern = urlToPattern(url);
    const now = Date.now();

    const existing = this.manifests.get(origin);
    const toolIndex = existing?.toolIndex ?? new Map();
    const oldPages = existing?.manifest.pages ?? {};
    const oldPage = oldPages[pattern];
    const currentTools = new Set(oldPage?.tools ?? []);

    // Remove tools
    for (const name of removed) {
      currentTools.delete(name);
      const entry = toolIndex.get(name);
      if (entry) {
        entry.patterns.delete(pattern);
        if (entry.patterns.size === 0) toolIndex.delete(name);
      }
    }

    // Add tools
    for (const tool of added) {
      currentTools.add(tool.name);
      const entry = toolIndex.get(tool.name);
      if (entry) {
        entry.patterns.add(pattern);
        entry.tool = toManifestTool(tool, pattern);
      } else {
        toolIndex.set(tool.name, {
          tool: toManifestTool(tool, pattern),
          patterns: new Set([pattern]),
        });
      }
    }

    const toolNames = [...currentTools];
    const hash = hashTools(
      toolNames
        .map((n) => toolIndex.get(n)?.tool)
        .filter(Boolean)
        .map((t) => ({
          name: t!.name,
          description: t!.description,
          inputSchema: t!.inputSchema,
          confidence: 0,
        })),
    );

    const pageToolSet: PageToolSet = {
      urlPattern: pattern,
      tools: toolNames,
      lastScanned: now,
      hash,
    };

    const pages: Record<string, PageToolSet> = { ...oldPages, [pattern]: pageToolSet };
    const deduped = rebuildTools(pages, toolIndex);

    const manifest: SiteToolManifest = {
      origin,
      version: (existing?.manifest.version ?? 0) + 1,
      generatedAt: now,
      pages,
      tools: deduped,
    };

    this.manifests.set(origin, { manifest, toolIndex });
    return manifest;
  }

  toMCPJson(origin: string): string {
    const manifest = this.getManifest(origin);
    if (!manifest) return JSON.stringify({ tools: [] });

    const mcpTools = manifest.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.annotations ? { annotations: t.annotations } : {}),
    }));

    return JSON.stringify({
      tools: mcpTools,
      _meta: {
        origin: manifest.origin,
        version: manifest.version,
        generatedAt: manifest.generatedAt,
        pageCount: Object.keys(manifest.pages).length,
        toolCount: manifest.tools.length,
      },
    });
  }

  getToolsForUrl(origin: string, url: string): ManifestTool[] {
    const manifest = this.getManifest(origin);
    if (!manifest) return [];

    const pattern = urlToPattern(url);
    const page = manifest.pages[pattern];
    if (!page) return [];

    const toolNames = new Set(page.tools);
    return manifest.tools.filter((t) => toolNames.has(t.name));
  }
}
