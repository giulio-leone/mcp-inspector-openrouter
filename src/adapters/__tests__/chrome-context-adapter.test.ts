import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChromeContextAdapter } from '../chrome-context-adapter';
import type { ChromeContextAdapterConfig } from '../chrome-context-adapter';
import type { PageContext, Message } from '../../ports/types';
import { getMessages } from '../../sidebar/chat-store';

// ── Mocks ──

vi.mock('../../sidebar/chat-store', () => ({ getMessages: vi.fn() }));
vi.mock('../../sidebar/debug-logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockSendMessage = vi.fn();
const mockExecuteScript = vi.fn();

vi.stubGlobal('chrome', {
  tabs: { sendMessage: mockSendMessage },
  scripting: { executeScript: mockExecuteScript },
});

// ── Helpers ──

function makeConfig(overrides?: Partial<ChromeContextAdapterConfig>): ChromeContextAdapterConfig {
  return { site: 'example.com', conversationId: 'conv-1', ...overrides };
}

function makePageContext(overrides?: Partial<PageContext>): PageContext {
  return { url: 'https://example.com', title: 'Example', ...overrides } as PageContext;
}

function makeMessage(content: string, role: Message['role'] = 'user'): Message {
  return { role, content } as Message;
}

// ── Tests ──

describe('ChromeContextAdapter', () => {
  let adapter: ChromeContextAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    adapter = new ChromeContextAdapter(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── constructor / setConfig ──

  describe('constructor', () => {
    it('sets config correctly', () => {
      const history = adapter.getConversationHistory();
      expect(getMessages).toHaveBeenCalledWith('example.com', 'conv-1');
    });
  });

  describe('setConfig', () => {
    it('updates site and conversationId', () => {
      adapter.setConfig(makeConfig({ site: 'other.com', conversationId: 'conv-2' }));
      adapter.getConversationHistory();
      expect(getMessages).toHaveBeenCalledWith('other.com', 'conv-2');
    });
  });

  // ── getPageContext ──

  describe('getPageContext', () => {
    it('returns context on first success', async () => {
      const ctx = makePageContext();
      // PING succeeds, GET_PAGE_CONTEXT returns ctx
      mockSendMessage.mockResolvedValueOnce('pong').mockResolvedValueOnce(ctx);

      const result = await adapter.getPageContext(1);

      expect(result).toEqual(ctx);
      expect(mockSendMessage).toHaveBeenCalledWith(1, { action: 'PING' });
      expect(mockSendMessage).toHaveBeenCalledWith(1, { action: 'GET_PAGE_CONTEXT' });
    });

    it('retries on failure (3 attempts)', async () => {
      mockSendMessage.mockRejectedValue(new Error('fail'));

      const promise = adapter.getPageContext(1);

      // Advance through all three retry delays: 500, 1000, 1500
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1500);

      await promise;

      // PING is called on each attempt (3 attempts)
      const pingCalls = mockSendMessage.mock.calls.filter(
        ([, msg]: [number, { action: string }]) => msg.action === 'PING',
      );
      expect(pingCalls).toHaveLength(3);
    });

    it('returns cached lastPageContext after all 3 failures', async () => {
      const ctx = makePageContext({ title: 'Cached' });
      // First call succeeds to populate cache
      mockSendMessage.mockResolvedValueOnce('pong').mockResolvedValueOnce(ctx);
      await adapter.getPageContext(1);

      // Second call fails all attempts
      mockSendMessage.mockRejectedValue(new Error('fail'));
      const promise = adapter.getPageContext(1);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1500);
      const result = await promise;

      expect(result).toEqual(ctx);
    });

    it('returns null if no cached context and all retries fail', async () => {
      mockSendMessage.mockRejectedValue(new Error('fail'));

      const promise = adapter.getPageContext(1);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1500);
      const result = await promise;

      expect(result).toBeNull();
    });

    it('retry delays increase linearly (500, 1000, 1500ms)', async () => {
      mockSendMessage.mockRejectedValue(new Error('fail'));

      const promise = adapter.getPageContext(1);

      // After 499ms only the first attempt should have happened
      await vi.advanceTimersByTimeAsync(499);
      // The PING for attempt 0 already fired, delay is 500ms for attempt 0
      // Advance 1ms to trigger the first setTimeout(500)
      await vi.advanceTimersByTimeAsync(1);
      // Now attempt 1 starts. Its delay is 1000ms.
      await vi.advanceTimersByTimeAsync(999);
      // Still waiting for second delay
      await vi.advanceTimersByTimeAsync(1);
      // Now attempt 2 starts. Its delay is 1500ms.
      await vi.advanceTimersByTimeAsync(1500);

      const result = await promise;
      expect(result).toBeNull();
    });

    it('injects content script when PING fails', async () => {
      const ctx = makePageContext();
      // PING fails, executeScript succeeds, then GET_PAGE_CONTEXT succeeds
      mockSendMessage
        .mockRejectedValueOnce(new Error('no listener'))
        .mockResolvedValueOnce(ctx);
      mockExecuteScript.mockResolvedValueOnce(undefined);

      const result = await adapter.getPageContext(42);

      expect(mockExecuteScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ['content.js'],
      });
      expect(result).toEqual(ctx);
    });

    it('succeeds on second attempt after first failure', async () => {
      const ctx = makePageContext({ title: 'Retry Success' });

      // Attempt 1: ensureContentScript PING fails → injects script → GET_PAGE_CONTEXT also fails
      // Attempt 2: ensureContentScript PING succeeds → GET_PAGE_CONTEXT succeeds
      mockSendMessage
        .mockRejectedValueOnce(new Error('ping fail'))       // PING attempt 1
        .mockRejectedValueOnce(new Error('ctx fail'))        // GET_PAGE_CONTEXT attempt 1
        .mockResolvedValueOnce('pong')                       // PING attempt 2
        .mockResolvedValueOnce(ctx);                         // GET_PAGE_CONTEXT attempt 2
      mockExecuteScript.mockResolvedValueOnce(undefined);    // injection on attempt 1

      const promise = adapter.getPageContext(1);
      await vi.advanceTimersByTimeAsync(1000); // delay after attempt 1 (500 * (0+1))
      const result = await promise;

      expect(result).toEqual(ctx);
    });
  });

  // ── getLiveState ──

  describe('getLiveState', () => {
    it('returns liveState from lastPageContext', async () => {
      const liveState = { timestamp: 123 } as PageContext['liveState'];
      const ctx = makePageContext({ liveState });
      mockSendMessage.mockResolvedValueOnce('pong').mockResolvedValueOnce(ctx);
      await adapter.getPageContext(1);

      expect(adapter.getLiveState()).toEqual(liveState);
    });

    it('returns null when no page context cached', () => {
      expect(adapter.getLiveState()).toBeNull();
    });

    it('returns null when lastPageContext exists but has no liveState', async () => {
      const ctx = makePageContext(); // no liveState field
      mockSendMessage.mockResolvedValueOnce('pong').mockResolvedValueOnce(ctx);
      await adapter.getPageContext(1);

      expect(adapter.getLiveState()).toBeNull();
    });
  });

  // ── getConversationHistory ──

  describe('getConversationHistory', () => {
    it('delegates to getMessages with correct site/conversationId', () => {
      const msgs = [makeMessage('hi')];
      vi.mocked(getMessages).mockReturnValue(msgs);

      const result = adapter.getConversationHistory();

      expect(getMessages).toHaveBeenCalledWith('example.com', 'conv-1');
      expect(result).toBe(msgs);
    });

    it('uses updated config after setConfig', () => {
      adapter.setConfig(makeConfig({ site: 'new.com', conversationId: 'conv-99' }));
      adapter.getConversationHistory();
      expect(getMessages).toHaveBeenCalledWith('new.com', 'conv-99');
    });
  });

  // ── summarizeIfNeeded ──

  describe('summarizeIfNeeded', () => {
    it('returns all messages when within budget', async () => {
      // "abcd" = 4 chars = 1 token each
      const msgs = [makeMessage('abcd'), makeMessage('abcd')];
      const result = await adapter.summarizeIfNeeded(msgs, 2);

      expect(result.originalCount).toBe(2);
      expect(result.compressedCount).toBe(2);
    });

    it('returns empty summary when within budget', async () => {
      const msgs = [makeMessage('abcd')];
      const result = await adapter.summarizeIfNeeded(msgs, 10);

      expect(result.summary).toBe('');
    });

    it('keeps most recent messages within budget', async () => {
      // 3 messages: each "abcd" = 1 token, budget = 2 tokens
      const msgs = [makeMessage('abcd'), makeMessage('abcd'), makeMessage('abcd')];
      const result = await adapter.summarizeIfNeeded(msgs, 2);

      expect(result.compressedCount).toBe(2);
      expect(result.originalCount).toBe(3);
    });

    it('returns correct droppedCount in summary', async () => {
      // 4 messages of 1 token each, budget = 2
      const msgs = [
        makeMessage('abcd'),
        makeMessage('abcd'),
        makeMessage('abcd'),
        makeMessage('abcd'),
      ];
      const result = await adapter.summarizeIfNeeded(msgs, 2);

      expect(result.summary).toContain('2 earlier messages');
    });

    it('singular "message" when 1 dropped', async () => {
      // 2 messages of 1 token each, budget = 1
      const msgs = [makeMessage('abcd'), makeMessage('abcd')];
      const result = await adapter.summarizeIfNeeded(msgs, 1);

      expect(result.summary).toBe(
        '[1 earlier message summarized to fit context window]',
      );
    });

    it('plural "messages" when multiple dropped', async () => {
      // 3 messages of 1 token each, budget = 1
      const msgs = [makeMessage('abcd'), makeMessage('abcd'), makeMessage('abcd')];
      const result = await adapter.summarizeIfNeeded(msgs, 1);

      expect(result.summary).toBe(
        '[2 earlier messages summarized to fit context window]',
      );
    });

    it('handles empty message array', async () => {
      const result = await adapter.summarizeIfNeeded([], 100);

      expect(result.originalCount).toBe(0);
      expect(result.compressedCount).toBe(0);
      expect(result.summary).toBe('');
    });

    it('keeps zero messages when budget is zero', async () => {
      const msgs = [makeMessage('abcd'), makeMessage('efgh')];
      const result = await adapter.summarizeIfNeeded(msgs, 0);

      expect(result.compressedCount).toBe(0);
      expect(result.originalCount).toBe(2);
      expect(result.summary).toContain('2 earlier messages');
    });

    it('drops all messages when single message exceeds budget', async () => {
      // "abcdefgh" = 8 chars = 2 tokens, budget = 1
      const msgs = [makeMessage('abcdefgh')];
      const result = await adapter.summarizeIfNeeded(msgs, 1);

      expect(result.compressedCount).toBe(0);
      expect(result.originalCount).toBe(1);
      expect(result.summary).toBe(
        '[1 earlier message summarized to fit context window]',
      );
    });

    it('estimates tokens correctly (~4 chars per token)', async () => {
      // 12 chars = ceil(12/4) = 3 tokens per message; budget = 5
      // Most recent fits (3 tokens), second-to-last would need 3 more (total 6 > 5)
      const msgs = [makeMessage('aaaaaaaaaaaa'), makeMessage('bbbbbbbbbbbb')];
      const result = await adapter.summarizeIfNeeded(msgs, 5);

      expect(result.compressedCount).toBe(1);
      expect(result.originalCount).toBe(2);
    });

    it('handles messages with varying lengths', async () => {
      // msg1: 20 chars = 5 tokens, msg2: 4 chars = 1 token, msg3: 8 chars = 2 tokens
      // budget = 3: keeps msg3 (2 tokens) + msg2 (1 token) = 3
      const msgs = [
        makeMessage('a'.repeat(20)),
        makeMessage('abcd'),
        makeMessage('abcdefgh'),
      ];
      const result = await adapter.summarizeIfNeeded(msgs, 3);

      expect(result.compressedCount).toBe(2);
      expect(result.originalCount).toBe(3);
    });
  });
});
