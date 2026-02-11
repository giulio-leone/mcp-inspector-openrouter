import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterAdapter, OpenRouterChat } from '../openrouter.adapter';
import type { AIResponse, ChatMessage, Tool } from '../../../types';
import {
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_MODELS_ENDPOINT,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
  AI_MAX_RETRIES,
} from '../../../utils/constants';

// ── Mock fetch globally ──
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const API_KEY = 'test-key-123';
const MODEL = 'test/model';

describe('OpenRouterAdapter', () => {
  let adapter: OpenRouterAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new OpenRouterAdapter({ apiKey: API_KEY, model: MODEL });
  });

  describe('sendMessage', () => {
    it('sends correct request format', async () => {
      const response: AIResponse = {
        choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(response));

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
      await adapter.sendMessage(messages);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(OPENROUTER_CHAT_ENDPOINT);
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body as string);
      expect(body.model).toBe(MODEL);
      expect(body.messages).toEqual(messages);
    });

    it('includes correct headers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: 'assistant', content: '' } }] }));

      await adapter.sendMessage([{ role: 'user', content: 'test' }]);

      const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['HTTP-Referer']).toBe(OPENROUTER_REFERER);
      expect(headers['X-Title']).toBe(OPENROUTER_TITLE);
    });

    it('includes tool declarations when tools provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: 'assistant', content: '' } }] }));

      const tools: Tool[] = [
        {
          name: 'search',
          description: 'Search the web',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        },
      ];

      await adapter.sendMessage([{ role: 'user', content: 'test' }], tools);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('search');
    });

    it('does not include tools key when no tools', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: 'assistant', content: '' } }] }));
      await adapter.sendMessage([{ role: 'user', content: 'test' }]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools).toBeUndefined();
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Invalid API key' } }, false, 401),
      );

      await expect(
        adapter.sendMessage([{ role: 'user', content: 'test' }]),
      ).rejects.toThrow('Invalid API key');
    });

    it('returns parsed response', async () => {
      const response: AIResponse = {
        choices: [{ message: { role: 'assistant', content: 'Answer' } }],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(response));

      const result = await adapter.sendMessage([{ role: 'user', content: 'Q' }]);
      expect(result.choices[0].message.content).toBe('Answer');
    });

    it('handles inputSchema as string (JSON)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { role: 'assistant', content: '' } }] }));

      const tools: Tool[] = [
        {
          name: 'test',
          description: 'Test tool',
          inputSchema: JSON.stringify({ type: 'object', properties: {} }),
        },
      ];

      await adapter.sendMessage([{ role: 'user', content: 'test' }], tools);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.tools[0].function.parameters).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('listModels', () => {
    it('returns parsed model list', async () => {
      const models = [
        { id: 'model-a', name: 'Model A' },
        { id: 'model-b', name: 'Model B' },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: models }));

      const result = await adapter.listModels();
      expect(result).toEqual(models);
    });

    it('sends correct endpoint and auth header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      await adapter.listModels();

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(OPENROUTER_MODELS_ENDPOINT);
      expect((opts.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Forbidden' } }, false, 403),
      );

      await expect(adapter.listModels()).rejects.toThrow('Forbidden');
    });
  });
});

describe('OpenRouterChat', () => {
  let chat: OpenRouterChat;

  beforeEach(() => {
    mockFetch.mockReset();
    chat = new OpenRouterChat(API_KEY, MODEL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends user message and builds history', async () => {
    const apiResp: AIResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hi there!' } }],
    };
    mockFetch.mockResolvedValue(jsonResponse(apiResp));

    const result = await chat.sendMessage({ message: 'Hello' });
    expect(result.text).toBe('Hi there!');
    expect(chat.history).toHaveLength(2); // user + assistant
    expect(chat.history[0].role).toBe('user');
    expect(chat.history[1].role).toBe('assistant');
  });

  it('retries on empty response', async () => {
    const emptyResp: AIResponse = { choices: [] };
    const goodResp: AIResponse = {
      choices: [{ message: { role: 'assistant', content: 'Got it' } }],
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse(emptyResp))
      .mockResolvedValueOnce(jsonResponse(goodResp));

    // Suppress console.warn during retry
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await chat.sendMessage({ message: 'test' });
    expect(result.text).toBe('Got it');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('throws after max retries with empty responses', async () => {
    const emptyResp: AIResponse = { choices: [] };
    mockFetch.mockResolvedValue(jsonResponse(emptyResp));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(chat.sendMessage({ message: 'test' })).rejects.toThrow(
      'OpenRouter returned no response after multiple attempts.',
    );
    expect(mockFetch).toHaveBeenCalledTimes(AI_MAX_RETRIES);

    warnSpy.mockRestore();
  });

  it('throws on API error without retrying', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Rate limited' } }, false, 429),
    );

    await expect(chat.sendMessage({ message: 'test' })).rejects.toThrow('Rate limited');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('parses function calls from response', async () => {
    const apiResp: AIResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: { name: 'search', arguments: '{"q":"test"}' },
              },
            ],
          },
        },
      ],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(apiResp));

    const result = await chat.sendMessage({ message: 'search for test' });
    expect(result.functionCalls).toHaveLength(1);
    expect(result.functionCalls![0].name).toBe('search');
    expect(result.functionCalls![0].args).toEqual({ q: 'test' });
    expect(result.functionCalls![0].id).toBe('call_123');
  });

  it('includes system message when config has systemInstruction', async () => {
    const apiResp: AIResponse = {
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(apiResp));

    await chat.sendMessage({
      message: 'hello',
      config: { systemInstruction: ['You are helpful', 'Be concise'] },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are helpful\nBe concise');
  });

  it('handles tool response messages', async () => {
    // First, simulate an assistant message to set up history
    const apiResp1: AIResponse = {
      choices: [{ message: { role: 'assistant', content: 'first' } }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(apiResp1));
    await chat.sendMessage({ message: 'start' });

    // Now send a tool response
    const apiResp2: AIResponse = {
      choices: [{ message: { role: 'assistant', content: 'processed' } }],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(apiResp2));

    await chat.sendMessage({
      message: [
        {
          functionResponse: {
            name: 'search',
            response: { result: { items: [] } },
            tool_call_id: 'call_123',
          },
        },
      ],
    });

    // History should contain tool message
    const toolMsg = chat.history.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.tool_call_id).toBe('call_123');
  });
});
