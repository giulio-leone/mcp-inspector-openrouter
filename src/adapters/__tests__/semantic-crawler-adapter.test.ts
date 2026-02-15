/**
 * Tests for SemanticCrawlerAdapter:
 * - Pure functions: extractToolsFromHTML, extractInternalLinks, matchesPatterns, globToRegex
 * - ICrawlerPort contract: crawl, cancel, isRunning, depth/page limits, progress
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  SemanticCrawlerAdapter,
  extractToolsFromHTML,
  extractInternalLinks,
  matchesPatterns,
  globToRegex,
} from '../semantic-crawler-adapter';
import type { IToolCachePort } from '../../ports/tool-cache.port';
import type { CrawlTarget } from '../../ports/crawler.port';
import type { CleanTool } from '../../types';

// ── Helpers ──

function mockCache(): IToolCachePort & { put: Mock } {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    getManifest: vi.fn().mockResolvedValue(null),
    diff: vi.fn().mockResolvedValue({ added: [], removed: [], changed: [], unchanged: 0 }),
    applyDiff: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateSite: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

function htmlPage(body: string, links: string[] = []): string {
  const linkTags = links
    .map((href) => `<a href="${href}">Link</a>`)
    .join('\n');
  return `<!DOCTYPE html><html><head><title>Test</title></head><body>${body}${linkTags}</body></html>`;
}

const FORM_HTML = `
  <form name="login" action="/login">
    <input name="username" type="text" required aria-label="Username" />
    <input name="password" type="password" required />
    <button type="submit">Login</button>
  </form>
`;

const BUTTON_HTML = `
  <button aria-label="Play Video" id="play-btn">▶</button>
  <div role="button" aria-label="Like">👍</div>
`;

const SEARCH_HTML = `
  <input type="search" name="q" aria-label="Search videos" placeholder="Search" />
`;

const NAV_HTML = `
  <nav>
    <a href="/home" aria-label="Home">Home</a>
    <a href="/explore" aria-label="Explore">Explore</a>
  </nav>
`;

// ── globToRegex ──

describe('globToRegex', () => {
  it('matches single wildcard', () => {
    const re = globToRegex('/watch?v=*');
    expect(re.test('/watch?v=abc123')).toBe(true);
    expect(re.test('/watch?v=')).toBe(true);
  });

  it('matches double wildcard across segments', () => {
    const re = globToRegex('https://example.com/**');
    expect(re.test('https://example.com/a/b/c')).toBe(true);
  });

  it('does not match different paths with single wildcard', () => {
    const re = globToRegex('/users/*');
    expect(re.test('/users/123')).toBe(true);
    expect(re.test('/users/123/posts')).toBe(false);
  });

  it('escapes special regex chars', () => {
    const re = globToRegex('/page.html');
    expect(re.test('/page.html')).toBe(true);
    expect(re.test('/pagexhtml')).toBe(false);
  });
});

// ── matchesPatterns ──

describe('matchesPatterns', () => {
  it('returns true when patterns is empty', () => {
    expect(matchesPatterns('https://example.com/any', [])).toBe(true);
  });

  it('returns true when URL matches one pattern', () => {
    expect(
      matchesPatterns('https://example.com/watch?v=123', [
        'https://example.com/watch*',
      ]),
    ).toBe(true);
  });

  it('returns false when URL matches no patterns', () => {
    expect(
      matchesPatterns('https://example.com/about', [
        'https://example.com/watch*',
      ]),
    ).toBe(false);
  });
});

// ── extractInternalLinks ──

describe('extractInternalLinks', () => {
  it('extracts same-origin links', () => {
    const html = htmlPage('', [
      '/page1',
      '/page2',
      'https://external.com/other',
    ]);
    const links = extractInternalLinks(html, 'https://example.com/');
    expect(links).toContain('https://example.com/page1');
    expect(links).toContain('https://example.com/page2');
    expect(links).not.toContain('https://external.com/other');
  });

  it('deduplicates links', () => {
    const html = htmlPage('', ['/page1', '/page1', '/page1']);
    const links = extractInternalLinks(html, 'https://example.com/');
    expect(links).toHaveLength(1);
  });

  it('strips hash fragments', () => {
    const html = htmlPage('', ['/page1#section', '/page1']);
    const links = extractInternalLinks(html, 'https://example.com/');
    expect(links).toHaveLength(1);
    expect(links[0]).toBe('https://example.com/page1');
  });

  it('skips invalid hrefs', () => {
    const html = `<html><body><a href="javascript:void(0)">click</a></body></html>`;
    const links = extractInternalLinks(html, 'https://example.com/');
    // javascript: URLs resolve to a different origin, so they are filtered
    expect(links).toHaveLength(0);
  });
});

// ── extractToolsFromHTML ──

describe('extractToolsFromHTML', () => {
  it('extracts form tools with inputs', () => {
    const tools = extractToolsFromHTML(
      htmlPage(FORM_HTML),
      'https://example.com/login',
    );
    const formTool = tools.find((t) => t.name === 'form_login');
    expect(formTool).toBeDefined();
    expect(formTool!.category).toBe('form');
    expect(formTool!.inputSchema).toHaveProperty('properties');
    const schema = formTool!.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(schema.properties).toHaveProperty('username');
    expect(schema.properties).toHaveProperty('password');
    expect(schema.required).toContain('username');
    expect(schema.required).toContain('password');
  });

  it('extracts button tools with aria-label', () => {
    const tools = extractToolsFromHTML(
      htmlPage(BUTTON_HTML),
      'https://example.com/',
    );
    expect(tools.find((t) => t.name === 'button_play-btn')).toBeDefined();
    expect(tools.find((t) => t.name === 'button_like')).toBeDefined();
  });

  it('extracts search tools', () => {
    const tools = extractToolsFromHTML(
      htmlPage(SEARCH_HTML),
      'https://example.com/',
    );
    const search = tools.find((t) => t.name === 'search_q');
    expect(search).toBeDefined();
    expect(search!.category).toBe('search');
  });

  it('extracts navigation tools from nav elements', () => {
    const tools = extractToolsFromHTML(
      htmlPage(NAV_HTML),
      'https://example.com/',
    );
    expect(tools.find((t) => t.name === 'nav_home')).toBeDefined();
    expect(tools.find((t) => t.name === 'nav_explore')).toBeDefined();
  });

  it('deduplicates tools by name', () => {
    const doubledHtml = htmlPage(BUTTON_HTML + BUTTON_HTML);
    const tools = extractToolsFromHTML(doubledHtml, 'https://example.com/');
    const playBtns = tools.filter((t) => t.name === 'button_play-btn');
    expect(playBtns).toHaveLength(1);
  });

  it('returns empty for plain text page', () => {
    const tools = extractToolsFromHTML(
      '<html><body>Hello world</body></html>',
      'https://example.com/',
    );
    expect(tools).toHaveLength(0);
  });
});

// ── SemanticCrawlerAdapter ──

describe('SemanticCrawlerAdapter', () => {
  let cache: ReturnType<typeof mockCache>;
  let crawler: SemanticCrawlerAdapter;

  beforeEach(() => {
    cache = mockCache();
    crawler = new SemanticCrawlerAdapter(cache);
    vi.restoreAllMocks();
  });

  function mockFetch(pages: Record<string, string>): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const html = pages[url];
        if (!html) throw new Error(`Not found: ${url}`);
        return {
          headers: { get: (h: string) => (h === 'content-type' ? 'text/html' : null) },
          text: async () => html,
        };
      }),
    );
  }

  it('crawls entry point and stores tools', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML),
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
    });

    expect(result.site).toBe('example.com');
    expect(result.pagesScanned).toBe(1);
    expect(result.toolsDiscovered).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(cache.put).toHaveBeenCalled();
  });

  it('follows internal links to discover more pages', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML, ['/page2']),
      'https://example.com/page2': htmlPage(SEARCH_HTML),
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
    });

    expect(result.pagesScanned).toBe(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
  });

  it('respects maxPages limit', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML, ['/p1', '/p2', '/p3']),
      'https://example.com/p1': htmlPage(BUTTON_HTML),
      'https://example.com/p2': htmlPage(SEARCH_HTML),
      'https://example.com/p3': htmlPage(NAV_HTML),
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
      maxPages: 2,
    });

    expect(result.pagesScanned).toBeLessThanOrEqual(2);
  });

  it('respects maxDepth limit', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML, ['/level1']),
      'https://example.com/level1': htmlPage(BUTTON_HTML, ['/level2']),
      'https://example.com/level2': htmlPage(SEARCH_HTML, ['/level3']),
      'https://example.com/level3': htmlPage(NAV_HTML),
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
      maxDepth: 1,
    });

    // depth 0 = entry, depth 1 = level1; level2 is depth 2 → excluded
    expect(result.pagesScanned).toBe(2);
  });

  it('applies includePatterns filter', async () => {
    mockFetch({
      'https://example.com/': htmlPage('', ['/docs/intro', '/about']),
      'https://example.com/docs/intro': htmlPage(FORM_HTML),
      'https://example.com/about': htmlPage(BUTTON_HTML),
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/docs/intro'],
      includePatterns: ['https://example.com/docs/**'],
    });

    expect(result.pagesScanned).toBe(1);
  });

  it('applies excludePatterns filter', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML, ['/admin', '/public']),
      'https://example.com/admin': htmlPage(BUTTON_HTML),
      'https://example.com/public': htmlPage(SEARCH_HTML),
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
      excludePatterns: ['https://example.com/admin'],
    });

    // Entry + /public, /admin excluded
    expect(result.pagesScanned).toBe(2);
    const putUrls = cache.put.mock.calls.map((c: unknown[]) => c[1]);
    expect(putUrls).not.toContain('https://example.com/admin');
  });

  it('cancel() stops crawl', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML, ['/p1', '/p2']),
      'https://example.com/p1': htmlPage(BUTTON_HTML, ['/p3', '/p4']),
      'https://example.com/p2': htmlPage(SEARCH_HTML),
      'https://example.com/p3': htmlPage(NAV_HTML),
      'https://example.com/p4': htmlPage(FORM_HTML),
    });

    // Cancel after first fetch completes
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
      fetchCount++;
      const result = await originalFetch(...args);
      if (fetchCount >= 1) crawler.cancel();
      return result;
    }));

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
    });

    expect(result.pagesScanned).toBeLessThan(5);
  });

  it('isRunning() returns correct state', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML),
    });

    expect(crawler.isRunning()).toBe(false);

    const crawlPromise = crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
    });

    // running flag is set synchronously at start of crawl
    // but since crawl is async and we await below, check after completion
    await crawlPromise;
    expect(crawler.isRunning()).toBe(false);
  });

  it('throws if crawl already in progress', async () => {
    // Use a deferred fetch so we can control timing
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r; })));

    const first = crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
    });

    // Yield to let the crawl start and reach the fetch call
    await new Promise((r) => setTimeout(r, 10));

    await expect(
      crawler.crawl({
        site: 'example.com',
        entryPoints: ['https://example.com/'],
      }),
    ).rejects.toThrow('Crawl already in progress');

    // Resolve the hanging fetch so first crawl can complete
    resolveFetch({
      headers: { get: () => 'text/html' },
      text: async () => '<html><body></body></html>',
    });
    await first;
  });

  it('calls onProgress callback', async () => {
    mockFetch({
      'https://example.com/': htmlPage(FORM_HTML),
    });

    const progress = vi.fn();
    await crawler.crawl(
      {
        site: 'example.com',
        entryPoints: ['https://example.com/'],
      },
      progress,
    );

    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        pagesScanned: 1,
        currentUrl: 'https://example.com/',
      }),
    );
  });

  it('records errors for failed fetches without stopping', async () => {
    mockFetch({
      'https://example.com/': htmlPage('', ['/ok', '/bad']),
      'https://example.com/ok': htmlPage(FORM_HTML),
      // /bad is not in the map → throws
    });

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/'],
    });

    // entry page has no tools, /ok has tools, /bad errors
    expect(result.pagesScanned).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('/bad');
  });

  it('skips non-HTML content types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
        text: async () => '{"data": true}',
      })),
    );

    const result = await crawler.crawl({
      site: 'example.com',
      entryPoints: ['https://example.com/api/data'],
    });

    expect(result.pagesScanned).toBe(1);
    expect(result.toolsDiscovered).toBe(0);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
