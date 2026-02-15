/**
 * SemanticCrawlerAdapter — ICrawlerPort implementation for extension context.
 *
 * Crawls sites via fetch + DOMParser, extracts semantic tool definitions
 * from HTML (forms, buttons, inputs, links with aria/data attributes),
 * and stores results in the IToolCachePort.
 */

import type {
  ICrawlerPort,
  CrawlTarget,
  CrawlProgress,
  CrawlResult,
  CleanTool,
} from '../ports/crawler.port';
import type { IToolCachePort } from '../ports/tool-cache.port';

const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_DEPTH = 3;

/** Convert a glob-like pattern to a RegExp */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '⟨DOUBLESTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨DOUBLESTAR⟩/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** Test if a URL matches any of the given glob patterns */
export function matchesPatterns(
  url: string,
  patterns: readonly string[],
): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((p) => globToRegex(p).test(url));
}

/** Extract same-origin internal links from parsed HTML */
export function extractInternalLinks(
  html: string,
  baseUrl: string,
): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href) continue;

    try {
      const resolved = new URL(href, baseUrl);
      // Same origin only
      if (resolved.hostname !== base.hostname) continue;
      // Strip hash
      resolved.hash = '';
      const canonical = resolved.href;
      if (!seen.has(canonical)) {
        seen.add(canonical);
        links.push(canonical);
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return links;
}

/** Extract semantic tool definitions from parsed HTML */
export function extractToolsFromHTML(
  html: string,
  _url: string,
): CleanTool[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tools: CleanTool[] = [];
  const seen = new Set<string>();

  const addTool = (tool: CleanTool): void => {
    if (!seen.has(tool.name)) {
      seen.add(tool.name);
      tools.push(tool);
    }
  };

  // Forms with action or name
  for (const form of doc.querySelectorAll('form')) {
    const name =
      form.getAttribute('name') ||
      form.getAttribute('id') ||
      form.getAttribute('aria-label');
    if (!name) continue;

    const properties: Record<
      string,
      { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; description?: string }
    > = {};
    const required: string[] = [];

    for (const input of form.querySelectorAll(
      'input[name], textarea[name], select[name]',
    )) {
      const inputName = input.getAttribute('name')!;
      const inputType = input.getAttribute('type') || 'text';
      const label =
        input.getAttribute('aria-label') ||
        input.getAttribute('placeholder') ||
        inputName;
      properties[inputName] = {
        type: inputType === 'number' ? 'number' as const : 'string' as const,
        description: label,
      };
      if (input.hasAttribute('required')) {
        required.push(inputName);
      }
    }

    addTool({
      name: `form_${name}`,
      description: `Submit form: ${name}`,
      inputSchema: { type: 'object', properties, required },
      confidence: 0.7,
      category: 'form',
    });
  }

  // Buttons with aria-label or meaningful text
  for (const btn of doc.querySelectorAll(
    'button[aria-label], [role="button"][aria-label]',
  )) {
    const label = btn.getAttribute('aria-label')!;
    const id = btn.getAttribute('id') || label.toLowerCase().replace(/\s+/g, '_');
    addTool({
      name: `button_${id}`,
      description: `Click: ${label}`,
      inputSchema: { type: 'object', properties: {} },
      confidence: 0.6,
      category: 'interactive',
    });
  }

  // Search inputs
  for (const input of doc.querySelectorAll(
    'input[type="search"], input[role="searchbox"], input[aria-label*="search" i]',
  )) {
    const label =
      input.getAttribute('aria-label') ||
      input.getAttribute('placeholder') ||
      'search';
    const id =
      input.getAttribute('name') ||
      input.getAttribute('id') ||
      'search';
    addTool({
      name: `search_${id}`,
      description: `Search: ${label}`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: label },
        },
        required: ['query'],
      },
      confidence: 0.8,
      category: 'search',
    });
  }

  // Navigation links with aria-label
  for (const nav of doc.querySelectorAll('nav a[aria-label], [role="navigation"] a[aria-label]')) {
    const label = nav.getAttribute('aria-label')!;
    const href = nav.getAttribute('href') || '';
    addTool({
      name: `nav_${label.toLowerCase().replace(/\s+/g, '_')}`,
      description: `Navigate: ${label}`,
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', description: href } },
      },
      confidence: 0.5,
      category: 'navigation',
    });
  }

  return tools;
}

export class SemanticCrawlerAdapter implements ICrawlerPort {
  private readonly cache: IToolCachePort;
  private abortController: AbortController | null = null;
  private running = false;

  constructor(cache: IToolCachePort) {
    this.cache = cache;
  }

  async crawl(
    target: CrawlTarget,
    onProgress?: (p: CrawlProgress) => void,
  ): Promise<CrawlResult> {
    if (this.running) {
      throw new Error('Crawl already in progress');
    }

    this.running = true;
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const maxPages = target.maxPages ?? DEFAULT_MAX_PAGES;
    const maxDepth = target.maxDepth ?? DEFAULT_MAX_DEPTH;
    const include = target.includePatterns ?? [];
    const exclude = target.excludePatterns ?? [];

    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = target.entryPoints.map(
      (url) => ({ url, depth: 0 }),
    );
    const errors: string[] = [];
    let toolsFound = 0;
    const start = Date.now();

    try {
      while (queue.length > 0 && visited.size < maxPages) {
        if (signal.aborted) break;

        const item = queue.shift()!;
        if (visited.has(item.url)) continue;
        if (item.depth > maxDepth) continue;

        // Apply include/exclude filters
        if (include.length > 0 && !matchesPatterns(item.url, [...include])) {
          continue;
        }
        if (exclude.length > 0 && matchesPatterns(item.url, [...exclude])) {
          continue;
        }

        visited.add(item.url);

        try {
          const response = await fetch(item.url, { signal });
          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.includes('text/html')) continue;

          const html = await response.text();

          // Extract tools and store in cache
          const tools = extractToolsFromHTML(html, item.url);
          if (tools.length > 0) {
            await this.cache.put(target.site, item.url, tools);
            toolsFound += tools.length;
          }

          // Extract links for further crawling
          if (item.depth < maxDepth) {
            const links = extractInternalLinks(html, item.url);
            for (const link of links) {
              if (!visited.has(link) && visited.size + queue.length < maxPages) {
                queue.push({ url: link, depth: item.depth + 1 });
              }
            }
          }

          onProgress?.({
            pagesScanned: visited.size,
            pagesTotal: Math.min(visited.size + queue.length, maxPages),
            currentUrl: item.url,
            toolsFound,
            errors: errors.length,
          });
        } catch (err) {
          if (signal.aborted) break;
          errors.push(
            `${item.url}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      this.running = false;
      this.abortController = null;
    }

    return {
      site: target.site,
      pagesScanned: visited.size,
      toolsDiscovered: toolsFound,
      duration: Date.now() - start,
      errors,
    };
  }

  cancel(): void {
    this.abortController?.abort();
  }

  isRunning(): boolean {
    return this.running;
  }
}
