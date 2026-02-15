/**
 * Tests for ToolManifestAdapter — derived MCP JSON tool manifest.
 *
 * Covers: manifest creation, incremental updates, diff application,
 * URL pattern grouping, cross-page deduplication, MCP JSON export,
 * and tool lookup by URL.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolManifestAdapter } from '../tool-manifest-adapter';
import type { CleanTool } from '../../types';

// ── Helpers ──

function tool(name: string, overrides: Partial<CleanTool> = {}): CleanTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object' as const, properties: {} },
    confidence: 0.8,
    ...overrides,
  };
}

describe('ToolManifestAdapter', () => {
  let adapter: ToolManifestAdapter;

  beforeEach(() => {
    adapter = new ToolManifestAdapter();
  });

  // ── Manifest creation ──

  describe('manifest creation from first page scan', () => {
    it('returns null for unknown origin', () => {
      expect(adapter.getManifest('example.com')).toBeNull();
    });

    it('creates manifest on first updatePage', () => {
      const manifest = adapter.updatePage(
        'youtube.com',
        'https://youtube.com/watch?v=abc',
        [tool('play'), tool('pause')],
      );
      expect(manifest.origin).toBe('youtube.com');
      expect(manifest.version).toBe(1);
      expect(manifest.tools).toHaveLength(2);
      expect(Object.keys(manifest.pages)).toHaveLength(1);
    });

    it('page entry contains correct URL pattern', () => {
      const manifest = adapter.updatePage(
        'youtube.com',
        'https://youtube.com/watch?v=abc',
        [tool('play')],
      );
      const page = manifest.pages['/watch?v=*'];
      expect(page).toBeDefined();
      expect(page.urlPattern).toBe('/watch?v=*');
      expect(page.tools).toEqual(['play']);
    });

    it('manifest is retrievable via getManifest', () => {
      adapter.updatePage('youtube.com', 'https://youtube.com/', [tool('search')]);
      const manifest = adapter.getManifest('youtube.com');
      expect(manifest).not.toBeNull();
      expect(manifest!.tools).toHaveLength(1);
    });
  });

  // ── Incremental updates ──

  describe('incremental updates (new page adds tools)', () => {
    it('adds new page with its own tools', () => {
      adapter.updatePage(
        'youtube.com',
        'https://youtube.com/watch?v=abc',
        [tool('play'), tool('pause')],
      );
      const manifest = adapter.updatePage(
        'youtube.com',
        'https://youtube.com/results?search_query=test',
        [tool('search'), tool('filter')],
      );

      expect(Object.keys(manifest.pages)).toHaveLength(2);
      expect(manifest.tools).toHaveLength(4);
      expect(manifest.version).toBe(2);
    });

    it('updating same page replaces tools', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('old_tool')],
      );
      const manifest = adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('new_tool')],
      );

      expect(manifest.tools).toHaveLength(1);
      expect(manifest.tools[0].name).toBe('new_tool');
      expect(manifest.version).toBe(2);
    });

    it('removing tools from a page removes them from manifest if not on other pages', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/a',
        [tool('shared'), tool('only_a')],
      );
      adapter.updatePage(
        'example.com',
        'https://example.com/b',
        [tool('shared'), tool('only_b')],
      );
      // Remove only_a from page /a by updating with different tools
      const manifest = adapter.updatePage(
        'example.com',
        'https://example.com/a',
        [tool('shared')],
      );

      const names = manifest.tools.map((t) => t.name).sort();
      expect(names).toEqual(['only_b', 'shared']);
    });
  });

  // ── Diff application ──

  describe('diff application (add/remove tools)', () => {
    it('adds tools via diff', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('existing')],
      );
      const manifest = adapter.applyDiff(
        'example.com',
        'https://example.com/page',
        [tool('new_tool')],
        [],
      );

      const names = manifest.tools.map((t) => t.name).sort();
      expect(names).toEqual(['existing', 'new_tool']);
    });

    it('removes tools via diff', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('keep'), tool('remove')],
      );
      const manifest = adapter.applyDiff(
        'example.com',
        'https://example.com/page',
        [],
        ['remove'],
      );

      expect(manifest.tools).toHaveLength(1);
      expect(manifest.tools[0].name).toBe('keep');
    });

    it('handles simultaneous add and remove', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('a'), tool('b')],
      );
      const manifest = adapter.applyDiff(
        'example.com',
        'https://example.com/page',
        [tool('c')],
        ['a'],
      );

      const names = manifest.tools.map((t) => t.name).sort();
      expect(names).toEqual(['b', 'c']);
    });

    it('diff on empty manifest creates it', () => {
      const manifest = adapter.applyDiff(
        'new-site.com',
        'https://new-site.com/page',
        [tool('first')],
        [],
      );

      expect(manifest.origin).toBe('new-site.com');
      expect(manifest.tools).toHaveLength(1);
    });

    it('increments version on diff', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('a')],
      );
      const manifest = adapter.applyDiff(
        'example.com',
        'https://example.com/page',
        [tool('b')],
        [],
      );
      expect(manifest.version).toBe(2);
    });
  });

  // ── URL pattern grouping ──

  describe('URL pattern grouping', () => {
    it('groups URLs with different query values under same pattern', () => {
      adapter.updatePage(
        'youtube.com',
        'https://youtube.com/watch?v=abc',
        [tool('play')],
      );
      const manifest = adapter.updatePage(
        'youtube.com',
        'https://youtube.com/watch?v=xyz',
        [tool('play'), tool('like')],
      );

      // Same pattern /watch?v=* — second update replaces
      expect(Object.keys(manifest.pages)).toHaveLength(1);
      expect(manifest.pages['/watch?v=*']).toBeDefined();
    });

    it('different paths create separate patterns', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/products',
        [tool('buy')],
      );
      const manifest = adapter.updatePage(
        'example.com',
        'https://example.com/cart',
        [tool('checkout')],
      );

      expect(Object.keys(manifest.pages)).toHaveLength(2);
    });

    it('sorts query params in pattern', () => {
      const manifest = adapter.updatePage(
        'example.com',
        'https://example.com/search?q=test&page=1&sort=new',
        [tool('search')],
      );

      expect(manifest.pages['/search?page=*&q=*&sort=*']).toBeDefined();
    });
  });

  // ── Cross-page deduplication ──

  describe('cross-page deduplication', () => {
    it('same tool on multiple pages results in single entry with multiple patterns', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page1',
        [tool('nav_home')],
      );
      const manifest = adapter.updatePage(
        'example.com',
        'https://example.com/page2',
        [tool('nav_home')],
      );

      expect(manifest.tools).toHaveLength(1);
      expect(manifest.tools[0].name).toBe('nav_home');
      expect(manifest.tools[0].pagePatterns).toEqual(['/page1', '/page2']);
    });

    it('unique tools remain separate', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page1',
        [tool('tool_a')],
      );
      const manifest = adapter.updatePage(
        'example.com',
        'https://example.com/page2',
        [tool('tool_b')],
      );

      expect(manifest.tools).toHaveLength(2);
    });

    it('tool removed from one page but present on another stays in manifest', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page1',
        [tool('shared'), tool('only1')],
      );
      adapter.updatePage(
        'example.com',
        'https://example.com/page2',
        [tool('shared')],
      );

      // Remove 'shared' only from page1 via diff
      const manifest = adapter.applyDiff(
        'example.com',
        'https://example.com/page1',
        [],
        ['shared'],
      );

      // 'shared' still exists on page2
      const sharedTool = manifest.tools.find((t) => t.name === 'shared');
      expect(sharedTool).toBeDefined();
      expect(sharedTool!.pagePatterns).toEqual(['/page2']);
    });
  });

  // ── MCP JSON export ──

  describe('MCP JSON export format validation', () => {
    it('returns empty tools array for unknown origin', () => {
      const json = adapter.toMCPJson('unknown.com');
      const parsed = JSON.parse(json);
      expect(parsed.tools).toEqual([]);
    });

    it('exports valid MCP-compatible JSON', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('search', {
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search query' } },
            required: ['query'],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        })],
      );

      const json = adapter.toMCPJson('example.com');
      const parsed = JSON.parse(json);

      expect(parsed.tools).toHaveLength(1);
      const t = parsed.tools[0];
      expect(t.name).toBe('search');
      expect(t.description).toBe('search tool');
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.properties.query.type).toBe('string');
      expect(t.annotations.readOnlyHint).toBe(true);
    });

    it('includes _meta with manifest metadata', () => {
      adapter.updatePage('example.com', 'https://example.com/a', [tool('t1')]);
      adapter.updatePage('example.com', 'https://example.com/b', [tool('t2')]);

      const parsed = JSON.parse(adapter.toMCPJson('example.com'));
      expect(parsed._meta.origin).toBe('example.com');
      expect(parsed._meta.version).toBe(2);
      expect(parsed._meta.pageCount).toBe(2);
      expect(parsed._meta.toolCount).toBe(2);
      expect(typeof parsed._meta.generatedAt).toBe('number');
    });

    it('omits annotations when not present', () => {
      adapter.updatePage('example.com', 'https://example.com/', [tool('simple')]);
      const parsed = JSON.parse(adapter.toMCPJson('example.com'));
      expect(parsed.tools[0].annotations).toBeUndefined();
    });

    it('does not include pagePatterns in MCP export', () => {
      adapter.updatePage('example.com', 'https://example.com/', [tool('t')]);
      const parsed = JSON.parse(adapter.toMCPJson('example.com'));
      expect(parsed.tools[0].pagePatterns).toBeUndefined();
    });

    it('parses string inputSchema to object', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/',
        [tool('form', { inputSchema: '{"type":"object","properties":{"name":{"type":"string"}}}' })],
      );
      const parsed = JSON.parse(adapter.toMCPJson('example.com'));
      expect(parsed.tools[0].inputSchema.type).toBe('object');
      expect(typeof parsed.tools[0].inputSchema).toBe('object');
    });
  });

  // ── Tool lookup by URL ──

  describe('tool lookup by URL', () => {
    it('returns empty array for unknown origin', () => {
      expect(adapter.getToolsForUrl('unknown.com', 'https://unknown.com/')).toEqual([]);
    });

    it('returns empty array for unscanned URL', () => {
      adapter.updatePage('example.com', 'https://example.com/a', [tool('t1')]);
      expect(adapter.getToolsForUrl('example.com', 'https://example.com/b')).toEqual([]);
    });

    it('returns tools for scanned URL', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/page',
        [tool('tool_a'), tool('tool_b')],
      );

      const tools = adapter.getToolsForUrl('example.com', 'https://example.com/page');
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual(['tool_a', 'tool_b']);
    });

    it('matches URL with different query values via pattern', () => {
      adapter.updatePage(
        'youtube.com',
        'https://youtube.com/watch?v=abc',
        [tool('play')],
      );

      // Different video ID, same pattern
      const tools = adapter.getToolsForUrl(
        'youtube.com',
        'https://youtube.com/watch?v=xyz',
      );
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('play');
    });

    it('returns ManifestTool objects with pagePatterns', () => {
      adapter.updatePage('example.com', 'https://example.com/a', [tool('shared')]);
      adapter.updatePage('example.com', 'https://example.com/b', [tool('shared')]);

      const tools = adapter.getToolsForUrl('example.com', 'https://example.com/a');
      expect(tools[0].pagePatterns).toEqual(['/a', '/b']);
    });
  });

  // ── Edge cases ──

  describe('edge cases', () => {
    it('handles empty tool array', () => {
      const manifest = adapter.updatePage('example.com', 'https://example.com/', []);
      expect(manifest.tools).toHaveLength(0);
      expect(manifest.pages['/'].tools).toEqual([]);
    });

    it('multiple origins are isolated', () => {
      adapter.updatePage('a.com', 'https://a.com/', [tool('t1')]);
      adapter.updatePage('b.com', 'https://b.com/', [tool('t2')]);

      expect(adapter.getManifest('a.com')!.tools).toHaveLength(1);
      expect(adapter.getManifest('b.com')!.tools).toHaveLength(1);
      expect(adapter.getManifest('a.com')!.tools[0].name).toBe('t1');
    });

    it('generatedAt is a recent timestamp', () => {
      const before = Date.now();
      const manifest = adapter.updatePage('example.com', 'https://example.com/', [tool('t')]);
      const after = Date.now();
      expect(manifest.generatedAt).toBeGreaterThanOrEqual(before);
      expect(manifest.generatedAt).toBeLessThanOrEqual(after);
    });

    it('manifest is JSON-serializable', () => {
      adapter.updatePage(
        'example.com',
        'https://example.com/',
        [tool('t', { category: 'form' })],
      );
      const manifest = adapter.getManifest('example.com')!;
      const serialized = JSON.stringify(manifest);
      const deserialized = JSON.parse(serialized);
      expect(deserialized.origin).toBe('example.com');
      expect(deserialized.tools[0].name).toBe('t');
    });
  });

  describe('malformed input handling', () => {
    it('handles malformed JSON string inputSchema gracefully', () => {
      const badTool = tool('bad', { inputSchema: 'not valid json' });
      const manifest = adapter.updatePage('example.com', 'https://example.com/page', [badTool]);
      expect(manifest.tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
    });

    it('produces consistent hashes between updatePage and applyDiff with string schemas', () => {
      const stringSchemaJson = '{"type":"object","properties":{"q":{"type":"string"}}}';
      const t1 = tool('search', { inputSchema: stringSchemaJson });

      const m1 = adapter.updatePage('s.com', 'https://s.com/page', [t1]);
      const hash1 = m1.pages[Object.keys(m1.pages)[0]].hash;

      // Reset and use applyDiff path
      const adapter2 = new ToolManifestAdapter();
      adapter2.updatePage('s.com', 'https://s.com/page', []);
      const m2 = adapter2.applyDiff('s.com', 'https://s.com/page', [t1], []);
      const hash2 = m2.pages[Object.keys(m2.pages)[0]].hash;

      expect(hash1).toBe(hash2);
    });
  });
});
