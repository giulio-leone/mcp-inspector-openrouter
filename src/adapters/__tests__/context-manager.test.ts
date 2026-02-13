/**
 * Tests for ContextManager.
 */

import { describe, it, expect, vi } from 'vitest';
import { ContextManager } from '../context-manager';

describe('ContextManager', () => {
  // 1. returns short results unchanged
  it('returns short results unchanged', () => {
    const cm = new ContextManager({ offloadThreshold: 100 });
    const result = 'short result';

    expect(cm.processToolResult('test_tool', result)).toBe(result);
  });

  // 2. offloads results exceeding threshold
  it('offloads results exceeding threshold', () => {
    const cm = new ContextManager({ offloadThreshold: 10, offloadPreviewChars: 20 });
    const longResult = 'a'.repeat(200);

    const processed = cm.processToolResult('big_tool', longResult);

    expect(processed).not.toBe(longResult);
    expect(processed).toContain('tokens offloaded');
    expect(processed).toContain('ref: offload-big_tool-');
  });

  // 3. offloaded preview contains truncated content
  it('offloaded preview contains truncated content', () => {
    const cm = new ContextManager({ offloadThreshold: 10, offloadPreviewChars: 8 });
    const longResult = 'abcdefghijklmnop'.repeat(10);

    const processed = cm.processToolResult('tool', longResult);

    expect(processed.startsWith('abcdefgh')).toBe(true);
    expect(processed).toContain('[…');
  });

  // 4. offloaded reference is retrievable via getOffloaded()
  it('offloaded reference is retrievable via getOffloaded()', () => {
    const cm = new ContextManager({ offloadThreshold: 10, offloadPreviewChars: 5 });
    const longResult = 'x'.repeat(200);

    const processed = cm.processToolResult('my_tool', longResult);
    const refMatch = processed.match(/ref: (offload-my_tool-\d+)/);
    expect(refMatch).not.toBeNull();

    const refId = refMatch![1];
    expect(cm.getOffloaded(refId)).toBe(longResult);
  });

  // 5. returns undefined for unknown offload ref
  it('returns undefined for unknown offload ref', () => {
    const cm = new ContextManager();
    expect(cm.getOffloaded('offload-nonexistent-999')).toBeUndefined();
  });

  // 6. tracks token usage cumulatively
  it('tracks token usage cumulatively', () => {
    const cm = new ContextManager();

    cm.trackUsage(100, 50);
    cm.trackUsage(200, 75);

    const usage = cm.getUsage();
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(125);
    expect(usage.totalTokens).toBe(425);
  });

  // 7. estimateTokens uses 4-chars-per-token approximation
  it('estimateTokens uses 4-chars-per-token approximation', () => {
    const cm = new ContextManager();

    expect(cm.estimateTokens('abcd')).toBe(1);
    expect(cm.estimateTokens('abcde')).toBe(2);
    expect(cm.estimateTokens('')).toBe(0);
    expect(cm.estimateTokens('a'.repeat(100))).toBe(25);
  });

  // 8. reset() clears usage and offloaded content
  it('reset() clears usage and offloaded content', () => {
    const cm = new ContextManager({ offloadThreshold: 10, offloadPreviewChars: 5 });

    cm.trackUsage(100, 50);
    const longResult = 'z'.repeat(200);
    const processed = cm.processToolResult('tool', longResult);
    const refMatch = processed.match(/ref: (offload-tool-\d+)/);
    const refId = refMatch![1];

    cm.reset();

    const usage = cm.getUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
    expect(cm.getOffloaded(refId)).toBeUndefined();
  });

  // 9. default config values are applied when no config provided
  it('default config values are applied when no config provided', () => {
    const cm = new ContextManager();
    // Default offloadThreshold is 5000 tokens = 20000 chars
    // A string of 19996 chars = 4999 tokens => not offloaded
    const justUnder = 'a'.repeat(19_996);
    expect(cm.processToolResult('tool', justUnder)).toBe(justUnder);

    // A string of 20004 chars = 5001 tokens => offloaded
    const justOver = 'b'.repeat(20_004);
    const processed = cm.processToolResult('tool', justOver);
    expect(processed).toContain('tokens offloaded');
    // Default offloadPreviewChars is 500
    expect(processed.startsWith('b'.repeat(500))).toBe(true);
  });

  // 10. concurrent calls to same tool produce unique ref IDs
  it('concurrent calls to same tool produce unique ref IDs', () => {
    const cm = new ContextManager({ offloadThreshold: 10, offloadPreviewChars: 5 });
    const longA = 'a'.repeat(200);
    const longB = 'b'.repeat(200);

    const processedA = cm.processToolResult('same_tool', longA);
    const processedB = cm.processToolResult('same_tool', longB);

    const refA = processedA.match(/ref: (offload-same_tool-\d+)/)![1];
    const refB = processedB.match(/ref: (offload-same_tool-\d+)/)![1];

    expect(refA).not.toBe(refB);
    expect(cm.getOffloaded(refA)).toBe(longA);
    expect(cm.getOffloaded(refB)).toBe(longB);
  });
});
