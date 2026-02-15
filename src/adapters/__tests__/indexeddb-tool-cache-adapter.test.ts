/**
 * Tests for WebMCP cache layer:
 * - Pure functions: urlToPattern, extractSite, hashTools
 * - IToolCachePort contract via in-memory mock adapter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  urlToPattern,
  extractSite,
  hashTools,
} from '../indexeddb-tool-cache-adapter';
import type {
  IToolCachePort,
  SiteManifest,
  CachedPage,
  ToolDiff,
} from '../../ports/tool-cache.port';
import type { CleanTool } from '../../types';

// ── Helpers ──

function tool(name: string, confidence = 0.8): CleanTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object' as const, properties: {} },
    confidence,
  };
}

// ── In-memory mock adapter that mirrors IndexedDB adapter logic ──

class InMemoryToolCacheAdapter implements IToolCachePort {
  private store = new Map<string, SiteManifest>();
  private readonly ttlMs: number;

  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = options?.ttlMs ?? 86400000;
  }

  async get(site: string, url: string): Promise<readonly CleanTool[] | null> {
    const manifest = await this.getManifest(site);
    if (!manifest) return null;
    const pattern = urlToPattern(url);
    const page = manifest.pages[pattern];
    if (!page) return null;
    if (Date.now() - page.scannedAt > this.ttlMs) return null;
    return page.tools;
  }

  async put(
    site: string,
    url: string,
    tools: readonly CleanTool[],
  ): Promise<void> {
    const pattern = urlToPattern(url);
    const hash = hashTools(tools);
    const now = Date.now();
    const existing = await this.getManifest(site);
    const manifest: SiteManifest = existing
      ? {
          ...existing,
          version: existing.version + 1,
          pages: { ...existing.pages },
        }
      : { site, version: 1, lastFullScan: now, pages: {} };
    (manifest.pages as Record<string, CachedPage>)[pattern] = {
      pattern,
      tools,
      hash,
      scannedAt: now,
    };
    this.store.set(site, manifest);
  }

  async getManifest(site: string): Promise<SiteManifest | null> {
    return this.store.get(site) ?? null;
  }

  async diff(
    site: string,
    url: string,
    liveTools: readonly CleanTool[],
  ): Promise<ToolDiff> {
    const cached = await this.get(site, url);
    if (!cached)
      return { added: liveTools, removed: [], changed: [], unchanged: 0 };

    const cachedMap = new Map(cached.map((t) => [t.name, t]));
    const liveMap = new Map(liveTools.map((t) => [t.name, t]));

    const added: CleanTool[] = [];
    const changed: CleanTool[] = [];
    const removed: string[] = [];

    for (const [name, t] of liveMap) {
      const prev = cachedMap.get(name);
      if (!prev) added.push(t);
      else if (hashTools([prev]) !== hashTools([t])) changed.push(t);
    }
    for (const name of cachedMap.keys()) {
      if (!liveMap.has(name)) removed.push(name);
    }
    const unchanged = liveTools.length - added.length - changed.length;
    return { added, removed, changed, unchanged };
  }

  async applyDiff(
    site: string,
    url: string,
    diff: ToolDiff,
  ): Promise<void> {
    const cached = await this.get(site, url);
    if (!cached) {
      await this.put(site, url, [...diff.added, ...diff.changed]);
      return;
    }
    const removedSet = new Set(diff.removed);
    const changedMap = new Map(diff.changed.map((t) => [t.name, t]));
    const merged = cached
      .filter((t) => !removedSet.has(t.name))
      .map((t) => changedMap.get(t.name) ?? t);
    const existingNames = new Set(merged.map((t) => t.name));
    for (const t of diff.added) {
      if (!existingNames.has(t.name)) merged.push(t);
    }
    await this.put(site, url, merged);
  }

  async invalidate(site: string, url: string): Promise<void> {
    const manifest = await this.getManifest(site);
    if (!manifest) return;
    const pattern = urlToPattern(url);
    if (!(pattern in manifest.pages)) return;
    const pages = { ...manifest.pages };
    delete pages[pattern];
    this.store.set(site, { ...manifest, version: manifest.version + 1, pages });
  }

  async invalidateSite(site: string): Promise<void> {
    this.store.delete(site);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

// ── Pure function tests ──

describe('urlToPattern', () => {
  it('strips query values and sorts keys', () => {
    expect(urlToPattern('https://youtube.com/watch?v=abc123&t=42')).toBe(
      '/watch?t=*&v=*',
    );
  });

  it('handles URLs without query params', () => {
    expect(urlToPattern('https://github.com/user/repo')).toBe('/user/repo');
  });

  it('strips trailing slash', () => {
    expect(urlToPattern('https://example.com/')).toBe('/');
  });

  it('handles single query param', () => {
    expect(urlToPattern('https://x.com/search?q=hello')).toBe('/search?q=*');
  });

  it('returns raw string for invalid URL', () => {
    expect(urlToPattern('not-a-url')).toBe('not-a-url');
  });

  it('handles paths with extra slashes', () => {
    expect(urlToPattern('https://example.com///page///')).toBe('///page');
  });
});

describe('extractSite', () => {
  it('returns hostname for valid URL', () => {
    expect(extractSite('https://www.youtube.com/watch?v=123')).toBe(
      'www.youtube.com',
    );
  });

  it('returns raw string for invalid URL', () => {
    expect(extractSite('bogus')).toBe('bogus');
  });

  it('handles subdomains', () => {
    expect(extractSite('https://mail.google.com/inbox')).toBe(
      'mail.google.com',
    );
  });
});

describe('hashTools', () => {
  it('returns consistent hash for same tools', () => {
    const tools = [tool('play'), tool('pause')];
    expect(hashTools(tools)).toBe(hashTools(tools));
  });

  it('order-independent (sorted internally)', () => {
    const a = [tool('play'), tool('pause')];
    const b = [tool('pause'), tool('play')];
    expect(hashTools(a)).toBe(hashTools(b));
  });

  it('different confidence produces different hash', () => {
    const a = [tool('play', 0.9)];
    const b = [tool('play', 0.5)];
    expect(hashTools(a)).not.toBe(hashTools(b));
  });

  it('different description produces different hash', () => {
    const a = [{ ...tool('play'), description: 'Play video' }];
    const b = [{ ...tool('play'), description: 'Play audio' }];
    expect(hashTools(a)).not.toBe(hashTools(b));
  });

  it('different schema produces different hash', () => {
    const a = [
      {
        ...tool('play'),
        inputSchema: {
          type: 'object' as const,
          properties: { speed: { type: 'number' } },
        },
      },
    ];
    const b = [tool('play')];
    expect(hashTools(a)).not.toBe(hashTools(b));
  });

  it('empty array produces deterministic hash', () => {
    expect(hashTools([])).toBe(hashTools([]));
  });
});

// ── IToolCachePort contract tests ──

describe('InMemoryToolCacheAdapter (IToolCachePort contract)', () => {
  let cache: IToolCachePort;
  const SITE = 'youtube.com';
  const URL = 'https://youtube.com/watch?v=abc';

  beforeEach(() => {
    cache = new InMemoryToolCacheAdapter();
  });

  it('returns null on cache miss', async () => {
    const result = await cache.get(SITE, URL);
    expect(result).toBeNull();
  });

  it('put then get returns same tools', async () => {
    const tools = [tool('play'), tool('pause')];
    await cache.put(SITE, URL, tools);
    const cached = await cache.get(SITE, URL);
    expect(cached).toHaveLength(2);
    expect(cached![0].name).toBe('play');
    expect(cached![1].name).toBe('pause');
  });

  it('getManifest returns full manifest after put', async () => {
    await cache.put(SITE, URL, [tool('play')]);
    const manifest = await cache.getManifest(SITE);
    expect(manifest).not.toBeNull();
    expect(manifest!.site).toBe(SITE);
    expect(manifest!.version).toBe(1);
    expect(Object.keys(manifest!.pages)).toHaveLength(1);
  });

  it('increments version on multiple puts', async () => {
    await cache.put(SITE, URL, [tool('play')]);
    await cache.put(SITE, URL, [tool('play'), tool('pause')]);
    const manifest = await cache.getManifest(SITE);
    expect(manifest!.version).toBe(2);
  });

  it('different URLs on same site create separate page entries', async () => {
    const url2 = 'https://youtube.com/results?search_query=test';
    await cache.put(SITE, URL, [tool('play')]);
    await cache.put(SITE, url2, [tool('search')]);
    const manifest = await cache.getManifest(SITE);
    expect(Object.keys(manifest!.pages)).toHaveLength(2);
  });

  it('diff detects added tools', async () => {
    await cache.put(SITE, URL, [tool('play')]);
    const result = await cache.diff(SITE, URL, [tool('play'), tool('like')]);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe('like');
    expect(result.removed).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it('diff detects removed tools', async () => {
    await cache.put(SITE, URL, [tool('play'), tool('pause')]);
    const result = await cache.diff(SITE, URL, [tool('play')]);
    expect(result.removed).toEqual(['pause']);
    expect(result.added).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it('diff detects changed tools (confidence differs)', async () => {
    await cache.put(SITE, URL, [tool('play', 0.9)]);
    const result = await cache.diff(SITE, URL, [tool('play', 0.5)]);
    expect(result.changed).toHaveLength(1);
    expect(result.unchanged).toBe(0);
  });

  it('diff on empty cache treats all as added', async () => {
    const result = await cache.diff(SITE, URL, [tool('a'), tool('b')]);
    expect(result.added).toHaveLength(2);
    expect(result.unchanged).toBe(0);
  });

  it('applyDiff merges added and changed, removes deleted', async () => {
    await cache.put(SITE, URL, [tool('play'), tool('pause'), tool('old')]);

    const diff: ToolDiff = {
      added: [tool('like')],
      removed: ['old'],
      changed: [tool('play', 0.99)],
      unchanged: 1,
    };
    await cache.applyDiff(SITE, URL, diff);

    const cached = await cache.get(SITE, URL);
    expect(cached).toHaveLength(3);
    const names = cached!.map((t) => t.name).sort();
    expect(names).toEqual(['like', 'pause', 'play']);
    expect(cached!.find((t) => t.name === 'play')!.confidence).toBe(0.99);
  });

  it('applyDiff on empty cache stores added + changed', async () => {
    const diff: ToolDiff = {
      added: [tool('play')],
      removed: [],
      changed: [tool('pause')],
      unchanged: 0,
    };
    await cache.applyDiff(SITE, URL, diff);
    const cached = await cache.get(SITE, URL);
    expect(cached).toHaveLength(2);
  });

  it('invalidate removes single URL from manifest', async () => {
    await cache.put(SITE, URL, [tool('play')]);
    await cache.invalidate(SITE, URL);
    const result = await cache.get(SITE, URL);
    expect(result).toBeNull();
    const manifest = await cache.getManifest(SITE);
    expect(manifest).not.toBeNull();
    expect(Object.keys(manifest!.pages)).toHaveLength(0);
  });

  it('invalidateSite removes entire manifest', async () => {
    await cache.put(SITE, URL, [tool('play')]);
    await cache.invalidateSite(SITE);
    expect(await cache.getManifest(SITE)).toBeNull();
  });

  it('clear removes all manifests', async () => {
    await cache.put(SITE, URL, [tool('play')]);
    await cache.put('x.com', 'https://x.com/home', [tool('tweet')]);
    await cache.clear();
    expect(await cache.getManifest(SITE)).toBeNull();
    expect(await cache.getManifest('x.com')).toBeNull();
  });

  it('TTL expiration returns null', async () => {
    const shortTtl = new InMemoryToolCacheAdapter({ ttlMs: 1 });
    await shortTtl.put(SITE, URL, [tool('play')]);
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 5));
    const result = await shortTtl.get(SITE, URL);
    expect(result).toBeNull();
  });
});
