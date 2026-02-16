import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator, type OrchestratorDeps } from '../agent-orchestrator';
import { ApprovalGateAdapter } from '../approval-gate-adapter';
import type { AgentContext, ToolCallRecord } from '../../ports/types';
import type { ParsedFunctionCall, PageContext, CleanTool, ToolResponse } from '../../types';
import { SecurityTierLevel } from '../../utils/constants';

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
  const contextPort = {};
  const planningPort = {
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    markStepDone: vi.fn(),
    markStepFailed: vi.fn(),
    advanceStep: vi.fn(),
  };
  const contextManager = {
    reset: vi.fn(),
    processToolResult: vi.fn((name: string, result: string) => result),
  };
  const tabSession = {
    buildContextSummary: vi.fn(() => '**Session context summary**'),
    setTabContext: vi.fn(),
    storeData: vi.fn(),
    endSession: vi.fn(),
  };
  const subagentPort = {
    spawn: vi.fn().mockResolvedValue({
      success: true,
      subagentId: 'sub-1',
      text: 'Subagent completed task',
      stepsCompleted: 3,
    }),
  };
  const mockChat = {
    sendMessage: vi.fn<(opts: { message: string | ToolResponse[]; config: unknown }) => Promise<ChatSendResponse>>(),
    trimHistory: vi.fn(),
  };
  const chatFactory = vi.fn(() => mockChat as any);
  const buildConfig = vi.fn().mockReturnValue({ model: 'test', systemInstruction: ['test'] });

  return {
    toolPort,
    contextPort,
    planningPort,
    contextManager,
    tabSession,
    subagentPort,
    mockChat,
    chatFactory,
    buildConfig,
  };
}

function makeDeps(mocks: ReturnType<typeof createMocks>, overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    toolPort: mocks.toolPort as any,
    contextPort: mocks.contextPort as any,
    planningPort: mocks.planningPort as any,
    contextManager: mocks.contextManager as any,
    tabSession: mocks.tabSession as any,
    subagentPort: mocks.subagentPort as any,
    chatFactory: mocks.chatFactory,
    buildConfig: mocks.buildConfig,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    tabId: 1,
    pageContext: { url: 'https://example.com' } as PageContext,
    tools: [{ name: 'tool1' }] as unknown as CleanTool[],
    mentionContexts: undefined as any,
    ...overrides,
  } as AgentContext;
}

describe('AgentOrchestrator — Integration Tests', () => {
  let mocks: ReturnType<typeof createMocks>;
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedIsNavigationTool.mockReturnValue(false);
    mocks = createMocks();
    orchestrator = new AgentOrchestrator(makeDeps(mocks));
  });

  // ── Multi-step flows ──

  describe('multi-step flows', () => {
    it('executes multiple sequential tool calls in a single iteration', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'click', args: { sel: '#btn1' } },
            { id: 'fc2', name: 'type', args: { text: 'hello' } },
            { id: 'fc3', name: 'submit', args: { form: '#form' } },
          ],
        })
        .mockResolvedValueOnce({ text: 'Form submitted' });

      const result = await orchestrator.run('fill form', makeContext());

      expect(mocks.toolPort.execute).toHaveBeenCalledTimes(3);
      expect(mocks.planningPort.markStepDone).toHaveBeenCalledTimes(3);
      expect(result.toolCalls).toHaveLength(3);
      expect(result.text).toBe('Form submitted');
    });

    it('handles complex multi-iteration workflow with state updates', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'fetch_data', args: { url: '/api/users' } }],
        })
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc2', name: 'process_data', args: { filter: 'active' } }],
        })
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc3', name: 'display_results', args: { count: 10 } }],
        })
        .mockResolvedValueOnce({ text: 'Workflow completed' });

      const result = await orchestrator.run('run workflow', makeContext());

      expect(mocks.mockChat.sendMessage).toHaveBeenCalledTimes(4);
      expect(mocks.planningPort.advanceStep).toHaveBeenCalledTimes(3);
      expect(result.stepsCompleted).toBe(4);
    });

    it('builds correct tool call records across multiple iterations', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'step1', args: { a: 1 } }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 'step2', args: { b: 2 } }] })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orchestrator.run('multi', makeContext());

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0]).toMatchObject({ name: 'step1', args: { a: 1 }, callId: 'fc1' });
      expect(result.toolCalls[1]).toMatchObject({ name: 'step2', args: { b: 2 }, callId: 'fc2' });
    });

    it('maintains correct step completion count across iterations', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't1', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't2', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc3', name: 't3', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orchestrator.run('go', makeContext());

      expect(result.stepsCompleted).toBe(4);
      expect(mocks.planningPort.advanceStep).toHaveBeenCalledTimes(3);
    });
  });

  // ── Context Manager Tests ──

  describe('context manager integration', () => {
    it('resets context manager on run start', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'hi' });

      await orchestrator.run('hello', makeContext());

      expect(mocks.contextManager.reset).toHaveBeenCalledTimes(1);
    });

    it('offloads large tool results via context manager', async () => {
      const largeData = 'x'.repeat(10000);
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: largeData });
      mocks.contextManager.processToolResult.mockReturnValueOnce('REFERENCE_001');

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'fetch', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('go', makeContext());

      expect(mocks.contextManager.processToolResult).toHaveBeenCalledWith('fetch', largeData);
      // Verify the offloaded reference (not original data) is sent to AI
      const toolResponse = mocks.mockChat.sendMessage.mock.calls[1][0].message;
      const responseContent = JSON.stringify(toolResponse);
      expect(responseContent).toContain('REFERENCE_001');
      expect(responseContent).not.toContain(largeData);
    });

    it('does not offload non-string results', async () => {
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: { count: 42 } });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'fetch', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('go', makeContext());

      expect(mocks.contextManager.processToolResult).not.toHaveBeenCalled();
    });

    it('skips context manager processing if not provided', async () => {
      const orch = new AgentOrchestrator(makeDeps(mocks, { contextManager: undefined }));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'fetch', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      await orch.run('go', makeContext());

      expect(mocks.contextManager.reset).not.toHaveBeenCalled();
    });
  });

  // ── Navigation and Rescan Tests ──

  describe('navigation and rescan', () => {
    it('triggers rescan when navigation tool succeeds', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'navigate');
      const newPageContext = { url: 'https://new.com' } as PageContext;
      const newTools = [{ name: 'newTool' }] as unknown as CleanTool[];
      mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: newPageContext, tools: newTools });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'navigate', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orchestrator.run('nav', makeContext());

      expect(mockedWaitForPageAndRescan).toHaveBeenCalled();
      expect(result.updatedPageContext).toBe(newPageContext);
      expect(result.updatedTools).toBe(newTools);
    });

    it('does not rescan if navigation fails', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'navigate');
      mocks.toolPort.execute.mockResolvedValueOnce({ success: false, error: 'navigation blocked' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'navigate', args: {} }] })
        .mockResolvedValueOnce({ text: 'failed' });

      await orchestrator.run('nav', makeContext());

      expect(mockedWaitForPageAndRescan).not.toHaveBeenCalled();
    });

    it('skips remaining tool calls after navigation', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'navigate');
      mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: {} as PageContext, tools: [] });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'navigate', args: {} },
            { id: 'fc2', name: 'click', args: {} },
            { id: 'fc3', name: 'type', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('nav', makeContext());

      // Only the navigate tool should be executed
      expect(mocks.toolPort.execute).toHaveBeenCalledTimes(1);
      // Verify skipped tool responses are sent to AI
      const secondCall = mocks.mockChat.sendMessage.mock.calls[1];
      const toolResponses = secondCall[0].message;
      const hasSkipped = toolResponses.some((r: Record<string, unknown>) =>
        JSON.stringify(r).includes('Skipped'),
      );
      expect(hasSkipped).toBe(true);
    });

    it('updates tab session after navigation rescan', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'nav');
      const newPageContext = { url: 'https://newurl.com', title: 'New Page' } as PageContext;
      mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: newPageContext, tools: [] });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'nav', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('nav', makeContext());

      expect(mocks.tabSession.setTabContext).toHaveBeenCalledWith(1, {
        url: 'https://newurl.com',
        title: 'New Page',
        extractedData: {},
      });
    });

    it('handles navigation in multi-call sequence correctly', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'nav');
      mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: {} as PageContext, tools: [] });
      mocks.toolPort.execute
        .mockResolvedValueOnce({ success: true, data: 'clicked' })
        .mockResolvedValueOnce({ success: true, data: 'navigated' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'click', args: {} },
            { id: 'fc2', name: 'nav', args: {} },
            { id: 'fc3', name: 'type', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('seq', makeContext());

      expect(mocks.toolPort.execute).toHaveBeenCalledTimes(2);
      const calls = mocks.toolPort.execute.mock.calls;
      expect(calls[0][0]).toBe('click');
      expect(calls[1][0]).toBe('nav');
    });
  });

  // ── Subagent Delegation Tests ──

  describe('subagent delegation', () => {
    it('delegates task to subagent and records result', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Extract data from page' } }],
        })
        .mockResolvedValueOnce({ text: 'Task delegated' });

      const result = await orchestrator.run('delegate', makeContext());

      expect(mocks.subagentPort.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Extract data from page',
          depth: 1,
        })
      );
      expect(result.text).toBe('Task delegated');
    });

    it('returns subagent result in tool response', async () => {
      mocks.subagentPort.spawn.mockResolvedValueOnce({
        success: true,
        subagentId: 'sub-123',
        text: 'Subagent found 5 items',
        stepsCompleted: 4,
      });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Find items' } }],
        })
        .mockResolvedValueOnce({ text: 'Result received' });

      await orchestrator.run('delegate', makeContext());

      const toolResponses = mocks.mockChat.sendMessage.mock.calls[1][0].message as ToolResponse[];
      expect(toolResponses[0].functionResponse.response).toEqual({
        result: 'Subagent found 5 items',
      });
    });

    it('handles subagent failure gracefully', async () => {
      mocks.subagentPort.spawn.mockResolvedValueOnce({
        success: false,
        subagentId: 'sub-456',
        error: 'Subagent timed out',
      });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Long task' } }],
        })
        .mockResolvedValueOnce({ text: 'Fallback response' });

      await orchestrator.run('delegate', makeContext());

      const toolResponses = mocks.mockChat.sendMessage.mock.calls[1][0].message as ToolResponse[];
      expect(toolResponses[0].functionResponse.response).toEqual({
        error: 'Subagent timed out',
      });
    });

    it('handles subagent spawn exception', async () => {
      mocks.subagentPort.spawn.mockRejectedValueOnce(new Error('Spawn failed'));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Task' } }],
        })
        .mockResolvedValueOnce({ text: 'Error handled' });

      await orchestrator.run('delegate', makeContext());

      const toolResponses = mocks.mockChat.sendMessage.mock.calls[1][0].message as ToolResponse[];
      expect(toolResponses[0].functionResponse.response).toEqual({
        error: 'Spawn failed',
      });
    });

    it('skips subagent delegation when port not provided', async () => {
      const orch = new AgentOrchestrator(makeDeps(mocks, { subagentPort: undefined }));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Task' } }],
        })
        .mockResolvedValueOnce({ text: 'executed as regular tool' });

      await orch.run('go', makeContext());

      // Should try to execute as a regular tool, not delegate
      expect(mocks.subagentPort.spawn).not.toHaveBeenCalled();
      expect(mocks.toolPort.execute).toHaveBeenCalledWith(
        'delegate_task',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('passes depth incremented for subagent', async () => {
      const orch = new AgentOrchestrator(makeDeps(mocks, { depth: 2 }));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Task' } }],
        })
        .mockResolvedValueOnce({ text: 'done' });

      await orch.run('go', makeContext());

      expect(mocks.subagentPort.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 3 })
      );
    });

    it('passes page liveState snapshot into subagent context', async () => {
      const liveState = {
        timestamp: Date.now(),
        media: [],
        forms: [],
        navigation: { currentUrl: 'https://example.com', scrollPercent: 10 },
        auth: { isLoggedIn: true, hasLoginForm: false, hasLogoutButton: true },
        interactive: {
          openModals: [],
          expandedAccordions: [],
          openDropdowns: [],
          activeTooltips: [],
          visibleNotifications: [],
        },
        visibility: { overlays: [], loadingIndicators: false },
      };

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Use live state' } }],
        })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('delegate', makeContext({
        pageContext: { url: 'https://example.com', liveState } as PageContext,
      }));

      expect(mocks.subagentPort.spawn).toHaveBeenCalledWith(expect.objectContaining({
        context: expect.objectContaining({ liveState }),
      }));
    });
  });

  // ── Approval Gate Integration ──

  describe('approval gate integration', () => {
    it('blocks Tier 2 tools when approval is denied', async () => {
      const innerToolPort = {
        execute: vi.fn().mockResolvedValue({ success: true, data: 'should-not-run' }),
        getAvailableTools: vi.fn().mockResolvedValue([]),
        onToolsChanged: vi.fn().mockReturnValue(() => {}),
      };
      const onApprovalNeeded = vi.fn().mockResolvedValue('denied');
      const resolveTier = vi.fn().mockReturnValue(SecurityTierLevel.MUTATION);
      const approvalGate = new ApprovalGateAdapter(innerToolPort as any, resolveTier, onApprovalNeeded);
      const orch = new AgentOrchestrator(makeDeps(mocks, { toolPort: approvalGate as any }));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delete_post', args: { id: 'p-1' } }],
        })
        .mockResolvedValueOnce({ text: 'handled' });

      const result = await orch.run('delete', makeContext());

      expect(onApprovalNeeded).toHaveBeenCalledWith(expect.objectContaining({
        toolName: 'delete_post',
        tier: SecurityTierLevel.MUTATION,
      }));
      expect(innerToolPort.execute).not.toHaveBeenCalled();
      expect(result.toolCalls[0].result.success).toBe(false);
      expect(result.toolCalls[0].result.error).toContain('denied');
    });

    it('bypasses approval in YOLO mode and executes Tier 2 tools', async () => {
      const innerToolPort = {
        execute: vi.fn().mockResolvedValue({ success: true, data: 'deleted' }),
        getAvailableTools: vi.fn().mockResolvedValue([]),
        onToolsChanged: vi.fn().mockReturnValue(() => {}),
      };
      const onApprovalNeeded = vi.fn().mockResolvedValue('denied');
      const resolveTier = vi.fn().mockReturnValue(SecurityTierLevel.MUTATION);
      const approvalGate = new ApprovalGateAdapter(innerToolPort as any, resolveTier, onApprovalNeeded);
      approvalGate.setAutoApprove(true);
      const orch = new AgentOrchestrator(makeDeps(mocks, { toolPort: approvalGate as any }));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delete_post', args: { id: 'p-1' } }],
        })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orch.run('delete', makeContext());

      expect(onApprovalNeeded).not.toHaveBeenCalled();
      expect(innerToolPort.execute).toHaveBeenCalledWith('delete_post', { id: 'p-1' }, expect.any(Object));
      expect(result.toolCalls[0].result).toEqual({ success: true, data: 'deleted' });
    });
  });

  // ── Timeout Tests ──

  describe('timeout handling', () => {
    it('breaks loop when timeout exceeded', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { loopTimeoutMs: 1000 },
      });

      let callCount = 0;
      const spy = vi.spyOn(performance, 'now');
      spy.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 0 : 1500;
      });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] });

      const result = await orch.run('go', makeContext());

      expect(result.text).toContain('Reached maximum tool iterations');
      spy.mockRestore();
    });

    it('emits timeout event when exceeded', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { loopTimeoutMs: 500 },
      });

      let callCount = 0;
      const spy = vi.spyOn(performance, 'now');
      spy.mockImplementation(() => (++callCount <= 1 ? 0 : 600));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] });

      const events: any[] = [];
      orch.onEvent((e) => events.push(e));

      await orch.run('go', makeContext());

      expect(events).toContainEqual({ type: 'timeout' });
      spy.mockRestore();
    });

    it('allows unlimited timeout when loopTimeoutMs is 0', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { loopTimeoutMs: 0 },
      });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orch.run('go', makeContext());

      expect(result.text).toBe('done');
    });

    it('respects custom timeout during complex workflow', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { loopTimeoutMs: 1000, maxIterations: 100 },
      });

      let callCount = 0;
      const spy = vi.spyOn(performance, 'now');
      spy.mockImplementation(() => {
        callCount++;
        // Simulate gradually increasing time
        return callCount <= 1 ? 0 : (callCount - 1) * 200;
      });

      mocks.mockChat.sendMessage.mockResolvedValue({
        functionCalls: [{ id: 'fc', name: 't', args: {} }],
      });

      const result = await orch.run('go', makeContext());

      // With perf.now returning 0, 200, 400, 600, 800, 1000, 1200...
      // Timeout fires when elapsed > 1000, so at iteration 6 (1200 > 1000)
      // sendMessage: 1 initial + 5 loop iterations = 6 calls
      expect(mocks.mockChat.sendMessage.mock.calls.length).toBeLessThanOrEqual(7);
      expect(mocks.mockChat.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
      spy.mockRestore();
    });

    it('respects maxIterations cap and emits max_iterations event', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { maxIterations: 3, loopTimeoutMs: 0 },
      });

      mocks.mockChat.sendMessage.mockResolvedValue({
        functionCalls: [{ id: 'fc', name: 't', args: {} }],
      });

      const events: any[] = [];
      orch.onEvent((e) => events.push(e));

      const result = await orch.run('go', makeContext());

      // 1 initial + 3 loop iterations = 4 sendMessage calls
      expect(mocks.mockChat.sendMessage).toHaveBeenCalledTimes(4);
      expect(result.text).toContain('maximum');
      expect(events.some((e) => e.type === 'max_iterations')).toBe(true);
    });
  });

  // ── Event Ordering Tests ──

  describe('event ordering and semantics', () => {
    it('emits events in correct order for single tool call', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'click', args: { sel: '#btn' } }] })
        .mockResolvedValueOnce({ text: 'Clicked' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('click', makeContext());

      expect(events[0].type).toBe('tool_call');
      expect(events[1].type).toBe('tool_result');
      expect(events[2].type).toBe('ai_response');
    });

    it('emits tool_call before tool_result in sequential calls', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'step1', args: {} },
            { id: 'fc2', name: 'step2', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'done' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('steps', makeContext());

      // Should see tool_call, tool_result alternating
      const toolEvents = events.filter((e) => e.type.startsWith('tool_'));
      expect(toolEvents[0].type).toBe('tool_call');
      expect(toolEvents[1].type).toBe('tool_result');
      expect(toolEvents[2].type).toBe('tool_call');
      expect(toolEvents[3].type).toBe('tool_result');
    });

    it('emits navigation event when tool succeeds', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'nav');
      mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: {} as PageContext, tools: [] });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'nav', args: {} }] })
        .mockResolvedValueOnce({ text: 'navigated' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('nav', makeContext());

      const navEvent = events.find((e) => e.type === 'navigation');
      expect(navEvent).toBeDefined();
      expect(navEvent.toolName).toBe('nav');
    });

    it('emits subagent events in correct sequence', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Task' } }],
        })
        .mockResolvedValueOnce({ text: 'done' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('delegate', makeContext());

      const subEvents = events.filter((e) => e.type && e.type.startsWith('subagent_'));
      expect(subEvents[0].type).toBe('subagent_started');
      expect(subEvents[1].type).toBe('subagent_completed');
    });

    it('maintains event sequence across multiple iterations', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't1', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't2', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('multi', makeContext());

      // Should have: tool_call, tool_result, tool_call, tool_result, ai_response
      expect(events.map((e) => e.type)).toEqual([
        'tool_call',
        'tool_result',
        'tool_call',
        'tool_result',
        'ai_response',
      ]);
    });

    it('emits subagent_failed on spawn error', async () => {
      mocks.subagentPort.spawn.mockRejectedValueOnce(new Error('Spawn error'));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Task' } }],
        })
        .mockResolvedValueOnce({ text: 'error handled' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('delegate', makeContext());

      const failEvent = events.find((e) => e.type === 'subagent_failed');
      expect(failEvent).toBeDefined();
      expect(failEvent.error).toBe('Spawn error');
    });
  });

  // ── Tab Session Integration ──

  describe('tab session integration', () => {
    it('initializes tab context on run start', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'hi' });

      const ctx = makeContext({
        pageContext: { url: 'https://example.com', title: 'Example' } as PageContext,
      });

      await orchestrator.run('go', ctx);

      expect(mocks.tabSession.setTabContext).toHaveBeenCalledWith(1, {
        url: 'https://example.com',
        title: 'Example',
        extractedData: {},
      });
    });

    it('stores successful tool results in tab session', async () => {
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'user data' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'fetch_user', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('fetch', makeContext());

      expect(mocks.tabSession.storeData).toHaveBeenCalledWith(1, 'fetch_user', 'user data');
    });

    it('does not store failed tool results', async () => {
      mocks.toolPort.execute.mockResolvedValueOnce({ success: false, error: 'Not found' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'fetch', args: {} }] })
        .mockResolvedValueOnce({ text: 'error' });

      await orchestrator.run('fetch', makeContext());

      expect(mocks.tabSession.storeData).not.toHaveBeenCalled();
    });

    it('enriches buildConfig with tab session context summary', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('go', makeContext());

      // Verify sendMessage received a config with session context in systemInstruction
      const sendCall = mocks.mockChat.sendMessage.mock.calls[0];
      const config = sendCall[0].config;
      const systemInstructions = config.systemInstruction ?? [];
      const hasSessionContext = systemInstructions.some(
        (s: string) => s.includes('MULTI-TAB SESSION CONTEXT') || s.includes('Session context summary'),
      );
      expect(hasSessionContext).toBe(true);
    });

    it('calls endSession on dispose', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'hi' });

      await orchestrator.run('go', makeContext());
      await orchestrator.dispose();

      expect(mocks.tabSession.endSession).toHaveBeenCalled();
    });

    it('uses mentionContext tabId for tab session operations', async () => {
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'result' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'fetch', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      const ctx = makeContext({ mentionContexts: [{ tabId: 99 }] as any });

      await orchestrator.run('go', ctx);

      expect(mocks.tabSession.storeData).toHaveBeenCalledWith(99, 'fetch', 'result');
    });
  });

  // ── Error Handling and Edge Cases ──

  describe('error handling and edge cases', () => {
    it('recovers from tool execution error and continues', async () => {
      mocks.toolPort.execute.mockRejectedValueOnce(new Error('Tab crashed'));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'bad_tool', args: {} }] })
        .mockResolvedValueOnce({ text: 'recovered' });

      const result = await orchestrator.run('go', makeContext());

      expect(result.toolCalls[0].result).toEqual({
        success: false,
        error: 'Tab crashed',
      });
      expect(mocks.planningPort.markStepFailed).toHaveBeenCalledWith('Tab crashed');
    });

    it('handles mixed success and failure tool calls', async () => {
      mocks.toolPort.execute
        .mockResolvedValueOnce({ success: true, data: 'ok' })
        .mockResolvedValueOnce({ success: false, error: 'failed' })
        .mockResolvedValueOnce({ success: true, data: 'ok' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 't1', args: {} },
            { id: 'fc2', name: 't2', args: {} },
            { id: 'fc3', name: 't3', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orchestrator.run('mixed', makeContext());

      expect(result.toolCalls[0].result.success).toBe(true);
      expect(result.toolCalls[1].result.success).toBe(false);
      expect(result.toolCalls[2].result.success).toBe(true);
      expect(mocks.planningPort.markStepDone).toHaveBeenCalledTimes(2);
      expect(mocks.planningPort.markStepFailed).toHaveBeenCalledTimes(1);
    });

    it('handles empty tool list', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'no tools' });

      const result = await orchestrator.run('go', makeContext({ tools: [] }));

      expect(result.text).toBe('no tools');
      expect(result.updatedTools).toEqual([]);
    });

    it('handles null pageContext gracefully', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'no context' });

      const result = await orchestrator.run('go', makeContext({ pageContext: null as any }));

      expect(result.text).toBe('no context');
      expect(result.updatedPageContext).toBeNull();
    });

    it('trims history on each iteration', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] })
        .mockResolvedValueOnce({ text: 'done' });

      await orchestrator.run('go', makeContext());

      // Once per iteration (not including initial call)
      expect(mocks.mockChat.trimHistory).toHaveBeenCalledTimes(2);
    });
  });

  // ── Complex Integration Scenarios ──

  describe('complex integration scenarios', () => {
    it('executes workflow with plan tools, regular tools, and subagent', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'create_plan', args: { goal: 'Extract data', steps: [] } },
            { id: 'fc2', name: 'click', args: {} },
          ],
        })
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc3', name: 'delegate_task', args: { prompt: 'Process' } },
          ],
        })
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc4', name: 'update_plan', args: { goal: 'Extract data', steps: [] } },
          ],
        })
        .mockResolvedValueOnce({ text: 'complete' });

      const result = await orchestrator.run('complex', makeContext());

      expect(mocks.planningPort.createPlan).toHaveBeenCalled();
      expect(mocks.toolPort.execute).toHaveBeenCalledWith('click', {}, expect.any(Object));
      expect(mocks.subagentPort.spawn).toHaveBeenCalled();
      expect(mocks.planningPort.updatePlan).toHaveBeenCalled();
      expect(result.stepsCompleted).toBe(4);
    });

    it('handles workflow with navigation in middle of multi-call sequence', async () => {
      mockedIsNavigationTool.mockImplementation((name: string) => name === 'nav');
      mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: {} as PageContext, tools: [] });
      mocks.toolPort.execute
        .mockResolvedValueOnce({ success: true, data: 'step1' })
        .mockResolvedValueOnce({ success: true, data: 'navigated' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'click', args: {} },
            { id: 'fc2', name: 'nav', args: {} },
            { id: 'fc3', name: 'type', args: {} },
            { id: 'fc4', name: 'submit', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'done' });

      const result = await orchestrator.run('workflow', makeContext());

      expect(mocks.toolPort.execute).toHaveBeenCalledTimes(2);
      expect(mocks.planningPort.markStepDone).toHaveBeenCalledTimes(2);
    });

    it('maintains tool call records with all response types', async () => {
      mocks.toolPort.execute
        .mockResolvedValueOnce({ success: true, data: 'success' })
        .mockResolvedValueOnce({ success: false, error: 'failed' })
        .mockRejectedValueOnce(new Error('exception'));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 'success_tool', args: { a: 1 } },
            { id: 'fc2', name: 'failure_tool', args: { b: 2 } },
            { id: 'fc3', name: 'exception_tool', args: { c: 3 } },
          ],
        })
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc4', name: 'create_plan', args: { goal: 'Plan', steps: [] } },
          ],
        })
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc5', name: 'delegate_task', args: { prompt: 'Delegate' } },
          ],
        })
        .mockResolvedValueOnce({ text: 'final' });

      const result = await orchestrator.run('all', makeContext());

      expect(result.toolCalls).toHaveLength(3);
      expect(result.toolCalls[0].result.success).toBe(true);
      expect(result.toolCalls[1].result.success).toBe(false);
      expect(result.toolCalls[2].result.success).toBe(false);
    });
  });

  // ── Planning Port Integration ──

  describe('planning port integration', () => {
    it('creates plan with correct steps structure', async () => {
      const steps = [
        { id: 's1', title: 'Step 1' },
        { id: 's2', title: 'Step 2' },
      ];

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'create_plan', args: { goal: 'Test', steps } }],
        })
        .mockResolvedValueOnce({ text: 'ok' });

      await orchestrator.run('plan', makeContext());

      expect(mocks.planningPort.createPlan).toHaveBeenCalledWith('Test', [
        { id: 's1', title: 'Step 1', status: 'pending' },
        { id: 's2', title: 'Step 2', status: 'pending' },
      ]);
    });

    it('updates plan with new steps', async () => {
      const steps = [{ id: 's3', title: 'New Step' }];

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [{ id: 'fc1', name: 'update_plan', args: { goal: 'Updated', steps } }],
        })
        .mockResolvedValueOnce({ text: 'ok' });

      await orchestrator.run('plan', makeContext());

      expect(mocks.planningPort.updatePlan).toHaveBeenCalledWith('Updated', [
        { id: 's3', title: 'New Step', status: 'pending' },
      ]);
    });

    it('marks step failed with error message from tool failure', async () => {
      mocks.toolPort.execute.mockResolvedValueOnce({ success: false, error: 'Connection timeout' });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'connect', args: {} }] })
        .mockResolvedValueOnce({ text: 'retry' });

      await orchestrator.run('go', makeContext());

      expect(mocks.planningPort.markStepFailed).toHaveBeenCalledWith('Connection timeout');
    });

    it('marks step failed with error message from exception', async () => {
      mocks.toolPort.execute.mockRejectedValueOnce(new Error('Process crashed'));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'process', args: {} }] })
        .mockResolvedValueOnce({ text: 'handled' });

      await orchestrator.run('go', makeContext());

      expect(mocks.planningPort.markStepFailed).toHaveBeenCalledWith('Process crashed');
    });

    it('advances step after batch of tool calls completes', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({
          functionCalls: [
            { id: 'fc1', name: 't1', args: {} },
            { id: 'fc2', name: 't2', args: {} },
          ],
        })
        .mockResolvedValueOnce({ text: 'ok' });

      await orchestrator.run('go', makeContext());

      // Should advance once per iteration, not per tool
      expect(mocks.planningPort.advanceStep).toHaveBeenCalledTimes(1);
    });
  });
});
