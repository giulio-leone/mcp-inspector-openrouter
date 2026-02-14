/**
 * Tests for TabSession wiring in AgentOrchestrator.
 * Validates multi-tab context injection, navigation updates,
 * data storage, and backward compatibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator, type OrchestratorDeps } from '../agent-orchestrator';
import type { AgentContext } from '../../ports/types';
import type { ITabSessionPort } from '../../ports/tab-session.port';
import type { ParsedFunctionCall, PageContext, CleanTool, ToolResponse } from '../../types';

vi.mock('../../sidebar/tool-loop', () => ({
  isNavigationTool: vi.fn(() => false),
  waitForPageAndRescan: vi.fn(),
}));

vi.mock('../../sidebar/debug-logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isNavigationTool, waitForPageAndRescan } from '../../sidebar/tool-loop';

const mockedIsNavigationTool = vi.mocked(isNavigationTool);
const mockedWaitForPageAndRescan = vi.mocked(waitForPageAndRescan);

interface ChatSendResponse {
  text?: string;
  reasoning?: string;
  functionCalls?: ParsedFunctionCall[];
}

function createMocks() {
  const toolPort = {
    execute: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
  };
  const planningPort = {
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    markStepDone: vi.fn(),
    markStepFailed: vi.fn(),
    advanceStep: vi.fn(),
  };
  const mockChat = {
    sendMessage: vi.fn<(opts: { message: string | ToolResponse[]; config: unknown }) => Promise<ChatSendResponse>>(),
    trimHistory: vi.fn(),
    history: [],
  };
  const chatFactory = vi.fn(() => mockChat as any);
  const buildConfig = vi.fn().mockReturnValue({ model: 'test', systemInstruction: ['Base system prompt'] });

  return { toolPort, planningPort, mockChat, chatFactory, buildConfig };
}

function createTabSession(): ITabSessionPort {
  return {
    startSession: vi.fn().mockReturnValue('session-123'),
    endSession: vi.fn(),
    setTabContext: vi.fn(),
    storeData: vi.fn(),
    getTabContext: vi.fn(),
    getAllContexts: vi.fn().mockReturnValue([]),
    buildContextSummary: vi.fn().mockReturnValue(''),
    getSessionId: vi.fn().mockReturnValue('session-123'),
  };
}

function makeDeps(mocks: ReturnType<typeof createMocks>, tabSession?: ITabSessionPort): OrchestratorDeps {
  return {
    toolPort: mocks.toolPort as any,
    contextPort: {} as any,
    planningPort: mocks.planningPort as any,
    chatFactory: mocks.chatFactory,
    buildConfig: mocks.buildConfig,
    ...(tabSession ? { tabSession } : {}),
  };
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    tabId: 1,
    pageContext: { url: 'https://example.com', title: 'Example' } as PageContext,
    tools: [{ name: 'tool1' }] as unknown as CleanTool[],
    mentionContexts: undefined as any,
    ...overrides,
  } as AgentContext;
}

describe('AgentOrchestrator — TabSession wiring', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedIsNavigationTool.mockReturnValue(false);
    mocks = createMocks();
  });

  // 1. Tab context is updated after navigation
  it('updates tab context after successful navigation', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mockedIsNavigationTool.mockImplementation((name: string) => name === 'navigate');
    const newPageContext = { url: 'https://new.com', title: 'New Page' } as PageContext;
    mockedWaitForPageAndRescan.mockResolvedValueOnce({
      pageContext: newPageContext,
      tools: [{ name: 'newTool' }] as unknown as CleanTool[],
    });
    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'navigated' });

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'navigate', args: { url: 'https://new.com' } }],
      })
      .mockResolvedValueOnce({ text: 'done' });

    await orchestrator.run('go', makeContext());

    expect(tabSession.setTabContext).toHaveBeenCalledWith(1, {
      url: 'https://new.com',
      title: 'New Page',
      extractedData: {},
    });
  });

  // 2. Tab session summary is injected into system prompt
  it('injects tab session summary into system prompt', async () => {
    const tabSession = createTabSession();
    vi.mocked(tabSession.buildContextSummary).mockReturnValue('## Multi-Tab Session Context\n### Tab: Example');
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });

    await orchestrator.run('hi', makeContext());

    // buildConfig is called once (initial). Check that the config passed to sendMessage has enriched systemInstruction.
    const sendCall = mocks.mockChat.sendMessage.mock.calls[0];
    const config = sendCall[0].config as { systemInstruction: string[] };
    expect(config.systemInstruction).toContain('**MULTI-TAB SESSION CONTEXT:**');
    expect(config.systemInstruction).toContain('## Multi-Tab Session Context\n### Tab: Example');
  });

  // 3. Successful tool results are stored via tabSession.storeData
  it('stores tool result data in tab session', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: { items: [1, 2, 3] } });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'search', args: { q: 'test' } }] })
      .mockResolvedValueOnce({ text: 'done' });

    await orchestrator.run('search', makeContext());

    expect(tabSession.storeData).toHaveBeenCalledWith(1, 'search', { items: [1, 2, 3] });
  });

  // 4. Backward compat: no tabSession works exactly as before
  it('works without tabSession (backward compat)', async () => {
    const orchestrator = new AgentOrchestrator(makeDeps(mocks));

    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'click', args: {} }] })
      .mockResolvedValueOnce({ text: 'Done' });

    const result = await orchestrator.run('click', makeContext());

    expect(result.text).toBe('Done');
    expect(result.toolCalls).toHaveLength(1);
    // Verify buildConfig was called without modification
    const config = mocks.buildConfig.mock.results[0].value;
    expect(config.systemInstruction).toEqual(['Base system prompt']);
  });

  // 5. Empty summary doesn't add noise to prompt
  it('does not inject empty summary into prompt', async () => {
    const tabSession = createTabSession();
    vi.mocked(tabSession.buildContextSummary).mockReturnValue('');
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });

    await orchestrator.run('hi', makeContext());

    const sendCall = mocks.mockChat.sendMessage.mock.calls[0];
    const config = sendCall[0].config as { systemInstruction: string[] };
    expect(config.systemInstruction).toEqual(['Base system prompt']);
    expect(config.systemInstruction).not.toContain('**MULTI-TAB SESSION CONTEXT:**');
  });

  // 6. storeData is not called for failed tool results
  it('does not store data for failed tool results', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mocks.toolPort.execute.mockResolvedValueOnce({ success: false, error: 'not found' });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'search', args: {} }] })
      .mockResolvedValueOnce({ text: 'fail' });

    await orchestrator.run('search', makeContext());

    expect(tabSession.storeData).not.toHaveBeenCalled();
  });

  // 7. storeData is not called when result.data is null/undefined
  it('does not store null/undefined data', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: null });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'click', args: {} }] })
      .mockResolvedValueOnce({ text: 'ok' });

    await orchestrator.run('click', makeContext());

    expect(tabSession.storeData).not.toHaveBeenCalled();
  });

  // 8. Summary is re-evaluated on each loop iteration
  it('re-evaluates summary each iteration', async () => {
    const tabSession = createTabSession();
    vi.mocked(tabSession.buildContextSummary)
      .mockReturnValueOnce('') // initial call: empty
      .mockReturnValueOnce('') // first iteration: empty
      .mockReturnValueOnce('## Context\n### Tab 1'); // second iteration: has data
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    // Return fresh objects so spread creates distinct configs
    mocks.buildConfig.mockImplementation(() => ({ model: 'test', systemInstruction: ['Base system prompt'] }));

    mocks.toolPort.execute.mockResolvedValue({ success: true, data: 'ok' });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't1', args: {} }] })
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't2', args: {} }] })
      .mockResolvedValueOnce({ text: 'done' });

    await orchestrator.run('go', makeContext());

    // buildConfig called 3 times (initial + 2 iterations)
    expect(tabSession.buildContextSummary).toHaveBeenCalledTimes(3);

    // Second loop iteration should have the enriched config
    const thirdConfig = mocks.mockChat.sendMessage.mock.calls[2][0].config as { systemInstruction: string[] };
    expect(thirdConfig.systemInstruction).toContain('**MULTI-TAB SESSION CONTEXT:**');
  });

  // 9. setTabContext is NOT called after navigation when rescan returns null pageContext
  it('does not set tab context after navigation when pageContext is null', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mockedIsNavigationTool.mockReturnValue(true);
    mockedWaitForPageAndRescan.mockResolvedValueOnce({
      pageContext: null as any,
      tools: [] as unknown as CleanTool[],
    });
    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'nav', args: {} }] })
      .mockResolvedValueOnce({ text: 'done' });

    await orchestrator.run('go', makeContext());

    // setTabContext called once at startup (seeding), NOT after navigation (null pageContext)
    expect(tabSession.setTabContext).toHaveBeenCalledTimes(1);
  });

  // 10. Initial tab context is seeded at run start
  it('seeds initial tab context from pageContext at run start', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'done' });

    await orchestrator.run('hi', makeContext());

    expect(tabSession.setTabContext).toHaveBeenCalledWith(1, {
      url: 'https://example.com',
      title: 'Example',
      extractedData: {},
    });
  });

  // 11. dispose() calls endSession()
  it('dispose calls endSession on tabSession', async () => {
    const tabSession = createTabSession();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, tabSession));

    await orchestrator.dispose();

    expect(tabSession.endSession).toHaveBeenCalledOnce();
  });
});
