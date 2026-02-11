import { describe, it, expect } from 'vitest';
import { BaseScanner } from '../base-scanner';
import type { Tool, ToolCategory, ConfidenceSignals } from '../../../types';
import { MAX_TOOLS_PER_CATEGORY } from '../../../utils/constants';

// Concrete subclass for testing abstract BaseScanner
class TestScanner extends BaseScanner {
  readonly category: ToolCategory = 'page-state';

  scan(): Tool[] {
    return [];
  }

  // Expose protected methods for testing
  public testComputeConfidence(signals: ConfidenceSignals): number {
    return this.computeConfidence(signals);
  }

  public testCreateTool(
    name: string,
    description: string,
    el: Element | null,
    confidence: number,
  ): Tool {
    return this.createTool(
      name,
      description,
      el,
      { type: 'object' as const, properties: {} },
      confidence,
    );
  }

  public testSlugify(text: string): string {
    return this.slugify(text);
  }

  public testMakeInputSchema(fields: { name: string; type: 'string'; description?: string; required?: boolean; enum?: readonly string[] }[]): ReturnType<BaseScanner['makeInputSchema']> {
    return this.makeInputSchema(fields);
  }

  public testMakeAnnotations(hints?: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean }) {
    return this.makeAnnotations(hints);
  }

  public get testMaxTools(): number {
    return this.maxTools;
  }
}

describe('BaseScanner.computeConfidence', () => {
  const scanner = new TestScanner();

  it('returns baseline 0.4 with no signals', () => {
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: false,
      hasName: false,
      hasRole: false,
      hasSemanticTag: false,
      isVisible: true,
    });
    expect(score).toBeCloseTo(0.4);
  });

  it('adds 0.15 for hasAria', () => {
    const score = scanner.testComputeConfidence({
      hasAria: true,
      hasLabel: false,
      hasName: false,
      hasRole: false,
      hasSemanticTag: false,
      isVisible: true,
    });
    expect(score).toBeCloseTo(0.55);
  });

  it('adds 0.15 for hasLabel', () => {
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: true,
      hasName: false,
      hasRole: false,
      hasSemanticTag: false,
      isVisible: true,
    });
    expect(score).toBeCloseTo(0.55);
  });

  it('adds 0.1 for hasName', () => {
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: false,
      hasName: true,
      hasRole: false,
      hasSemanticTag: false,
      isVisible: true,
    });
    expect(score).toBeCloseTo(0.5);
  });

  it('adds 0.1 for hasRole', () => {
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: false,
      hasName: false,
      hasRole: true,
      hasSemanticTag: false,
      isVisible: true,
    });
    expect(score).toBeCloseTo(0.5);
  });

  it('adds 0.1 for hasSemanticTag', () => {
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: false,
      hasName: false,
      hasRole: false,
      hasSemanticTag: true,
      isVisible: true,
    });
    expect(score).toBeCloseTo(0.5);
  });

  it('subtracts 0.2 when not visible', () => {
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: false,
      hasName: false,
      hasRole: false,
      hasSemanticTag: false,
      isVisible: false,
    });
    expect(score).toBeCloseTo(0.2);
  });

  it('caps at 1.0 with all signals positive', () => {
    const score = scanner.testComputeConfidence({
      hasAria: true,
      hasLabel: true,
      hasName: true,
      hasRole: true,
      hasSemanticTag: true,
      isVisible: true,
    });
    expect(score).toBe(1.0);
  });

  it('floors at 0 (never negative)', () => {
    // baseline 0.4, -0.2 for invisible = 0.2, still positive
    // But the method uses Math.max(0, ...) so it cannot go below 0
    const score = scanner.testComputeConfidence({
      hasAria: false,
      hasLabel: false,
      hasName: false,
      hasRole: false,
      hasSemanticTag: false,
      isVisible: false,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('BaseScanner.createTool', () => {
  const scanner = new TestScanner();

  it('produces a valid tool object', () => {
    const tool = scanner.testCreateTool('test-tool', 'A test tool', null, 0.8);
    expect(tool.name).toBe('test-tool');
    expect(tool.description).toBe('A test tool');
    expect(tool.category).toBe('page-state');
    expect(tool.confidence).toBe(0.8);
    expect(tool._source).toBe('inferred');
    expect(tool.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('sets title to description by default', () => {
    const tool = scanner.testCreateTool('t', 'My Description', null, 0.5);
    expect(tool.title).toBe('My Description');
  });

  it('includes annotations', () => {
    const tool = scanner.testCreateTool('t', 'desc', null, 0.5);
    expect(tool.annotations).toBeDefined();
    expect(tool.annotations!.readOnlyHint).toBe(false);
    expect(tool.annotations!.openWorldHint).toBe(true);
  });

  it('accepts element reference', () => {
    const el = document.createElement('button');
    const tool = scanner.testCreateTool('btn', 'Click', el, 0.7);
    expect(tool._el).toBe(el);
  });
});

describe('BaseScanner.slugify', () => {
  const scanner = new TestScanner();

  it('lowercases and replaces spaces', () => {
    expect(scanner.testSlugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(scanner.testSlugify('foo@bar#baz!')).toBe('foo-bar-baz');
  });

  it('trims leading/trailing hyphens', () => {
    expect(scanner.testSlugify('---test---')).toBe('test');
  });

  it('truncates to 64 chars', () => {
    expect(scanner.testSlugify('a'.repeat(100)).length).toBe(64);
  });

  it('handles empty input', () => {
    expect(scanner.testSlugify('')).toBe('');
  });
});

describe('BaseScanner.makeInputSchema', () => {
  const scanner = new TestScanner();

  it('builds schema from fields', () => {
    const schema = scanner.testMakeInputSchema([
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'limit', type: 'string', description: 'Max results' },
    ]);

    expect(schema.type).toBe('object');
    expect(schema.properties.query.type).toBe('string');
    expect(schema.properties.query.description).toBe('Search query');
    expect(schema.required).toEqual(['query']);
  });

  it('omits required array when no fields are required', () => {
    const schema = scanner.testMakeInputSchema([
      { name: 'foo', type: 'string' },
    ]);
    expect(schema.required).toBeUndefined();
  });

  it('handles empty fields array', () => {
    const schema = scanner.testMakeInputSchema([]);
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toHaveLength(0);
  });

  it('includes enum values', () => {
    const schema = scanner.testMakeInputSchema([
      { name: 'color', type: 'string', enum: ['red', 'green', 'blue'] },
    ]);
    expect(schema.properties.color.enum).toEqual(['red', 'green', 'blue']);
  });
});

describe('BaseScanner.makeAnnotations', () => {
  const scanner = new TestScanner();

  it('returns defaults with no hints', () => {
    const ann = scanner.testMakeAnnotations();
    expect(ann.readOnlyHint).toBe(false);
    expect(ann.destructiveHint).toBe(false);
    expect(ann.idempotentHint).toBe(false);
    expect(ann.openWorldHint).toBe(true);
  });

  it('respects custom hints', () => {
    const ann = scanner.testMakeAnnotations({ readOnly: true, destructive: true });
    expect(ann.readOnlyHint).toBe(true);
    expect(ann.destructiveHint).toBe(true);
  });
});

describe('BaseScanner.maxTools', () => {
  it('equals MAX_TOOLS_PER_CATEGORY constant', () => {
    const scanner = new TestScanner();
    expect(scanner.testMaxTools).toBe(MAX_TOOLS_PER_CATEGORY);
  });
});
