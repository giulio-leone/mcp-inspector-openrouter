import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chrome API mock ──

const mockSendMessage = vi.fn();

vi.stubGlobal('chrome', {
  tabs: { sendMessage: mockSendMessage },
});

import { TabDelegationAdapter } from '../tab-delegation-adapter';
import type { TabAgent } from '../../ports/tab-delegation.port';

describe('TabDelegationAdapter', () => {
  let adapter: TabDelegationAdapter;

  beforeEach(() => {
    adapter = new TabDelegationAdapter();
    mockSendMessage.mockReset();
  });

  // ── registerTab / unregisterTab ──

  describe('registerTab', () => {
    it('adds a tab to the registry', () => {
      adapter.registerTab(1, 'https://youtube.com', 'YouTube', ['video', 'media']);
      const tabs = adapter.listRegisteredTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0]).toEqual({
        tabId: 1,
        url: 'https://youtube.com',
        title: 'YouTube',
        skills: ['video', 'media'],
      });
    });

    it('overwrites on duplicate registration', () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.registerTab(1, 'https://b.com', 'B', ['y']);
      const tabs = adapter.listRegisteredTabs();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].url).toBe('https://b.com');
      expect(tabs[0].skills).toEqual(['y']);
    });

    it('does not share skill array reference with caller', () => {
      const skills = ['a', 'b'];
      adapter.registerTab(1, 'https://a.com', 'A', skills);
      skills.push('c');
      expect(adapter.listRegisteredTabs()[0].skills).toEqual(['a', 'b']);
    });
  });

  describe('unregisterTab', () => {
    it('removes a registered tab', () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.unregisterTab(1);
      expect(adapter.listRegisteredTabs()).toHaveLength(0);
    });

    it('is a no-op for unknown tab', () => {
      adapter.unregisterTab(999);
      expect(adapter.listRegisteredTabs()).toHaveLength(0);
    });
  });

  // ── findTabForTask ──

  describe('findTabForTask', () => {
    beforeEach(() => {
      adapter.registerTab(1, 'https://youtube.com', 'YouTube', ['video', 'media', 'playback']);
      adapter.registerTab(2, 'https://mail.google.com', 'Gmail', ['email', 'compose', 'inbox']);
      adapter.registerTab(3, 'https://docs.google.com', 'Docs', ['document', 'edit', 'compose']);
    });

    it('returns the tab with exact skill match', () => {
      const result = adapter.findTabForTask(['video', 'media', 'playback']);
      expect(result?.tabId).toBe(1);
    });

    it('returns the tab with highest partial overlap', () => {
      // 'compose' matches Gmail (1/3) and Docs (1/3), but 'email' only matches Gmail
      const result = adapter.findTabForTask(['email', 'compose']);
      expect(result?.tabId).toBe(2);
    });

    it('returns null when no skills overlap', () => {
      const result = adapter.findTabForTask(['spreadsheet', 'formula']);
      expect(result).toBeNull();
    });

    it('returns null for empty required skills', () => {
      const result = adapter.findTabForTask([]);
      expect(result).toBeNull();
    });

    it('returns null when no tabs are registered', () => {
      const empty = new TabDelegationAdapter();
      expect(empty.findTabForTask(['video'])).toBeNull();
    });

    it('picks the first best when scores are tied', () => {
      // 'compose' matches both Gmail (tab 2) and Docs (tab 3) equally
      const result = adapter.findTabForTask(['compose']);
      expect(result).not.toBeNull();
      // First encountered with score > 0 wins; Map iteration is insertion-order
      expect(result?.tabId).toBe(2);
    });

    it('excludes specified tabId from matching', () => {
      // Tab 1 has 'video' but we exclude it — should find no other with 'playback'
      const result = adapter.findTabForTask(['video', 'playback'], 1);
      expect(result).toBeNull();
    });

    it('falls back to second-best when best tab is excluded', () => {
      adapter.registerTab(10, 'https://vimeo.com', 'Vimeo', ['video', 'streaming']);
      // Tab 1 is best for 'video' but excluded — tab 10 is next
      const result = adapter.findTabForTask(['video'], 1);
      expect(result?.tabId).toBe(10);
    });
  });

  // ── delegate ──

  describe('delegate', () => {
    it('sends message and returns completed result', async () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.registerTab(2, 'https://b.com', 'B', ['y']);
      mockSendMessage.mockResolvedValueOnce({ data: 'ok' });

      const result = await adapter.delegate(1, 2, 'do something');

      expect(result.sourceTabId).toBe(1);
      expect(result.targetTabId).toBe(2);
      expect(result.taskDescription).toBe('do something');
      expect(result.status).toBe('completed');
      expect(result.result).toEqual({ data: 'ok' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockSendMessage).toHaveBeenCalledWith(2, {
        action: 'A2A_DELEGATE',
        taskDescription: 'do something',
        sourceTabId: 1,
      });
    });

    it('returns failed when target tab is not registered', async () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      const result = await adapter.delegate(1, 999, 'task');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Tab 999 is not registered');
      expect(result.durationMs).toBe(0);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('returns failed when chrome.tabs.sendMessage rejects', async () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.registerTab(2, 'https://b.com', 'B', ['y']);
      mockSendMessage.mockRejectedValueOnce(new Error('Tab not reachable'));

      const result = await adapter.delegate(1, 2, 'task');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Tab not reachable');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles non-Error throw values', async () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.registerTab(2, 'https://b.com', 'B', ['y']);
      mockSendMessage.mockRejectedValueOnce('string error');

      const result = await adapter.delegate(1, 2, 'task');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('string error');
    });

    it('measures duration for successful delegation', async () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.registerTab(2, 'https://b.com', 'B', ['y']);
      mockSendMessage.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('done'), 50)),
      );

      const result = await adapter.delegate(1, 2, 'slow task');
      expect(result.status).toBe('completed');
      expect(result.durationMs).toBeGreaterThanOrEqual(40);
    });
  });

  // ── listRegisteredTabs ──

  describe('listRegisteredTabs', () => {
    it('returns empty array when no tabs registered', () => {
      expect(adapter.listRegisteredTabs()).toEqual([]);
    });

    it('returns all registered tabs', () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      adapter.registerTab(2, 'https://b.com', 'B', ['y']);
      expect(adapter.listRegisteredTabs()).toHaveLength(2);
    });

    it('returns a new array on each call (defensive copy)', () => {
      adapter.registerTab(1, 'https://a.com', 'A', ['x']);
      const a = adapter.listRegisteredTabs();
      const b = adapter.listRegisteredTabs();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
