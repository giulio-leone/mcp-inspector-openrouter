import { describe, it, expect } from 'vitest';
import { mergeToolSets, getSecurityTier } from '../merge';
import type { Tool } from '../../types';

function makeTool(overrides: Partial<Tool> & { name: string }): Tool {
  return {
    description: `Tool: ${overrides.name}`,
    inputSchema: { type: 'object' as const, properties: {} },
    ...overrides,
  };
}

describe('mergeToolSets', () => {
  it('returns empty array for empty inputs', () => {
    expect(mergeToolSets([], [], [])).toEqual([]);
  });

  it('merges disjoint tool sets', () => {
    const native = [makeTool({ name: 'a' })];
    const declarative = [makeTool({ name: 'b' })];
    const inferred = [makeTool({ name: 'c' })];

    const result = mergeToolSets(native, declarative, inferred);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('native wins over declarative for same name', () => {
    const native = [makeTool({ name: 'submit', description: 'native submit' })];
    const declarative = [makeTool({ name: 'submit', description: 'declarative submit' })];

    const result = mergeToolSets(native, declarative, []);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('native submit');
    expect(result[0]._source).toBe('native');
  });

  it('native wins over inferred for same name', () => {
    const native = [makeTool({ name: 'click', description: 'native click' })];
    const inferred = [makeTool({ name: 'click', description: 'inferred click' })];

    const result = mergeToolSets(native, [], inferred);
    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('native');
  });

  it('declarative wins over inferred for same name', () => {
    const declarative = [makeTool({ name: 'search', description: 'declarative search' })];
    const inferred = [makeTool({ name: 'search', description: 'inferred search' })];

    const result = mergeToolSets([], declarative, inferred);
    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('declarative');
  });

  it('handles all three sets with overlapping names', () => {
    const native = [makeTool({ name: 'x', description: 'n' })];
    const declarative = [makeTool({ name: 'x', description: 'd' }), makeTool({ name: 'y', description: 'd' })];
    const inferred = [makeTool({ name: 'x', description: 'i' }), makeTool({ name: 'y', description: 'i' }), makeTool({ name: 'z', description: 'i' })];

    const result = mergeToolSets(native, declarative, inferred);
    expect(result).toHaveLength(3);

    const x = result.find((t) => t.name === 'x')!;
    expect(x._source).toBe('native');

    const y = result.find((t) => t.name === 'y')!;
    expect(y._source).toBe('declarative');

    const z = result.find((t) => t.name === 'z')!;
    expect(z._source).toBe('inferred');
  });

  it('sets _source correctly on all tools', () => {
    const result = mergeToolSets(
      [makeTool({ name: 'a' })],
      [makeTool({ name: 'b' })],
      [makeTool({ name: 'c' })],
    );
    expect(result.find((t) => t.name === 'a')?._source).toBe('native');
    expect(result.find((t) => t.name === 'b')?._source).toBe('declarative');
    expect(result.find((t) => t.name === 'c')?._source).toBe('inferred');
  });
});

describe('getSecurityTier', () => {
  it('returns SAFE (0) for page-state category', () => {
    expect(getSecurityTier(makeTool({ name: 'read-state', category: 'page-state' }))).toBe(0);
  });

  it('returns SAFE (0) for media category', () => {
    expect(getSecurityTier(makeTool({ name: 'play-video', category: 'media' }))).toBe(0);
  });

  it('returns NAVIGATION (1) for navigation category', () => {
    expect(getSecurityTier(makeTool({ name: 'go-home', category: 'navigation' }))).toBe(1);
  });

  it('returns NAVIGATION (1) for search category', () => {
    expect(getSecurityTier(makeTool({ name: 'site-search', category: 'search' }))).toBe(1);
  });

  it('returns NAVIGATION (1) for schema-org with search in name', () => {
    expect(getSecurityTier(makeTool({ name: 'schema-search-action', category: 'schema-org' }))).toBe(1);
  });

  it('returns MUTATION (2) for form category', () => {
    expect(getSecurityTier(makeTool({ name: 'submit-form', category: 'form' }))).toBe(2);
  });

  it('returns MUTATION (2) for auth category', () => {
    expect(getSecurityTier(makeTool({ name: 'login', category: 'auth' }))).toBe(2);
  });

  it('returns MUTATION (2) for ecommerce category', () => {
    expect(getSecurityTier(makeTool({ name: 'buy', category: 'ecommerce' }))).toBe(2);
  });

  it('returns MUTATION (2) for richtext category', () => {
    expect(getSecurityTier(makeTool({ name: 'edit-text', category: 'richtext' }))).toBe(2);
  });

  it('returns MUTATION (2) for file-upload category', () => {
    expect(getSecurityTier(makeTool({ name: 'upload', category: 'file-upload' }))).toBe(2);
  });

  it('returns MUTATION (2) for social-action category', () => {
    expect(getSecurityTier(makeTool({ name: 'like-post', category: 'social-action' }))).toBe(2);
  });

  it('returns MUTATION (2) for interactive toggle', () => {
    expect(getSecurityTier(makeTool({ name: 'ui.toggle-dark-mode', category: 'interactive' }))).toBe(2);
  });

  it('defaults to NAVIGATION (1) for schema-org without search', () => {
    expect(getSecurityTier(makeTool({ name: 'schema-view', category: 'schema-org' }))).toBe(1);
  });

  it('defaults to NAVIGATION (1) for unknown/missing category', () => {
    expect(getSecurityTier(makeTool({ name: 'unknown-tool' }))).toBe(1);
  });
});
