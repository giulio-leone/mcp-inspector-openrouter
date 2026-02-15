import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator, type OrchestratorDeps } from '../agent-orchestrator';
import type { AgentContext, ToolCallRecord } from '../../ports/types';
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
  const contextPort = {};
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
  };
  const chatFactory = vi.fn(() => mockChat as any);
  const buildConfig = vi.fn().mockReturnValue({ model: 'test' });

  return { toolPort, contextPort, planningPort, mockChat, chatFactory, buildConfig };
}

function makeDeps(mocks: ReturnType<typeof createMocks>): OrchestratorDeps {
  return {
    toolPort: mocks.toolPort as any,
    contextPort: mocks.contextPort as any,
    planningPort: mocks.planningPort as any,
    chatFactory: mocks.chatFactory,
    buildConfig: mocks.buildConfig,
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

describe('AgentOrchestrator', () => {
  let mocks: ReturnType<typeof createMocks>;
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedIsNavigationTool.mockReturnValue(false);
    mocks = createMocks();
    orchestrator = new AgentOrchestrator(makeDeps(mocks));
  });

  // 1. Returns text when AI responds with no function calls
  it('returns text when AI responds with no function calls', async () => {
    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });
    const result = await orchestrator.run('hi', makeContext());
    expect(result.text).toBe('Hello');
    expect(result.toolCalls).toEqual([]);
  });

  // 2. Executes tool and returns result when AI makes one tool call then stops
  it('executes tool and returns result after one tool call', async () => {
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'click', args: { selector: '#btn' } }] })
      .mockResolvedValueOnce({ text: 'Done' });

    const result = await orchestrator.run('click button', makeContext());
    expect(mocks.toolPort.execute).toHaveBeenCalledWith('click', { selector: '#btn' }, expect.any(Object));
    expect(result.text).toBe('Done');
  });

  // 3. Records tool call in toolCallRecords
  it('records tool call in toolCallRecords', async () => {
    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'clicked' });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'click', args: { sel: 'a' } }] })
      .mockResolvedValueOnce({ text: 'ok' });

    const result = await orchestrator.run('go', makeContext());
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'click',
      args: { sel: 'a' },
      callId: 'fc1',
      result: { success: true, data: 'clicked' },
    });
  });

  // 4. Marks step done on successful tool execution
  it('marks step done on successful tool execution', async () => {
    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
      .mockResolvedValueOnce({ text: 'done' });

    await orchestrator.run('go', makeContext());
    expect(mocks.planningPort.markStepDone).toHaveBeenCalled();
  });

  // 5. Marks step failed on failed tool execution
  it('marks step failed on failed tool execution', async () => {
    mocks.toolPort.execute.mockResolvedValueOnce({ success: false, error: 'not found' });
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
      .mockResolvedValueOnce({ text: 'fail' });

    await orchestrator.run('go', makeContext());
    expect(mocks.planningPort.markStepFailed).toHaveBeenCalledWith('not found');
  });

  // 6. Handles exception from toolPort.execute
  it('handles exception from toolPort.execute', async () => {
    mocks.toolPort.execute.mockRejectedValueOnce(new Error('boom'));
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
      .mockResolvedValueOnce({ text: 'recovered' });

    const result = await orchestrator.run('go', makeContext());
    expect(mocks.planningPort.markStepFailed).toHaveBeenCalledWith('boom');
    expect(result.toolCalls[0].result).toEqual({ success: false, error: 'boom' });
    expect(result.text).toBe('recovered');
  });

  // 7. Plan tool (create_plan) routes to planningPort.createPlan
  it('routes create_plan to planningPort.createPlan', async () => {
    const args = { goal: 'Test goal', steps: [{ id: 's1', title: 'Step 1' }] };
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'create_plan', args }] })
      .mockResolvedValueOnce({ text: 'planned' });

    await orchestrator.run('plan', makeContext());
    expect(mocks.planningPort.createPlan).toHaveBeenCalledWith('Test goal', [{ id: 's1', title: 'Step 1', status: 'pending' }]);
  });

  // 8. Plan tool (update_plan) routes to planningPort.updatePlan
  it('routes update_plan to planningPort.updatePlan', async () => {
    const args = { goal: 'Updated goal', steps: [{ id: 's2', title: 'Step 2' }] };
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'update_plan', args }] })
      .mockResolvedValueOnce({ text: 'updated' });

    await orchestrator.run('plan', makeContext());
    expect(mocks.planningPort.updatePlan).toHaveBeenCalledWith('Updated goal', [{ id: 's2', title: 'Step 2', status: 'pending' }]);
  });

  // 9. Plan tool response uses correct verb
  it('uses "created" verb for create_plan and "updated" for update_plan', async () => {
    const createArgs = { goal: 'G1', steps: [] };
    const updateArgs = { goal: 'G2', steps: [] };
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [
          { id: 'fc1', name: 'create_plan', args: createArgs },
          { id: 'fc2', name: 'update_plan', args: updateArgs },
        ],
      })
      .mockResolvedValueOnce({ text: 'ok' });

    await orchestrator.run('plan', makeContext());

    const sendCalls = mocks.mockChat.sendMessage.mock.calls;
    const toolResponses = sendCalls[1][0].message as ToolResponse[];
    expect(toolResponses[0].functionResponse.response).toEqual({ result: 'Plan "G1" created' });
    expect(toolResponses[1].functionResponse.response).toEqual({ result: 'Plan "G2" updated' });
  });

  // 10. Navigation tool triggers rescan and skips remaining calls
  it('triggers rescan on navigation tool and skips remaining calls', async () => {
    mockedIsNavigationTool.mockImplementation((name: string) => name === 'navigate');
    const newPageContext = { url: 'https://new.com' } as PageContext;
    const newTools = [{ name: 'newTool' }] as unknown as CleanTool[];
    mockedWaitForPageAndRescan.mockResolvedValueOnce({ pageContext: newPageContext, tools: newTools });
    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'navigated' });

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [
          { id: 'fc1', name: 'navigate', args: { url: 'https://new.com' } },
          { id: 'fc2', name: 'click', args: { sel: '#btn' } },
        ],
      })
      .mockResolvedValueOnce({ text: 'done' });

    const result = await orchestrator.run('go', makeContext());
    expect(mockedWaitForPageAndRescan).toHaveBeenCalled();
    expect(mocks.toolPort.execute).toHaveBeenCalledTimes(1);
    expect(result.updatedPageContext).toBe(newPageContext);
    expect(result.updatedTools).toBe(newTools);
  });

  // 11. Skipped calls after navigation get skip response
  it('sends skip response for calls after navigation', async () => {
    mockedIsNavigationTool.mockImplementation((name: string) => name === 'navigate');
    mockedWaitForPageAndRescan.mockResolvedValueOnce({
      pageContext: { url: 'https://new.com' } as PageContext,
      tools: [] as unknown as CleanTool[],
    });
    mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [
          { id: 'fc1', name: 'navigate', args: {} },
          { id: 'fc2', name: 'skipped_tool', args: {} },
        ],
      })
      .mockResolvedValueOnce({ text: 'end' });

    await orchestrator.run('go', makeContext());

    const toolResponses = mocks.mockChat.sendMessage.mock.calls[1][0].message as ToolResponse[];
    const skipped = toolResponses.find((r) => r.functionResponse.name === 'skipped_tool');
    expect(skipped!.functionResponse.response).toEqual({
      result: 'Skipped: page navigated, this tool no longer exists on the new page.',
    });
  });

  // 12. Advances step after each iteration
  it('advances step after each iteration', async () => {
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't1', args: {} }] })
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't2', args: {} }] })
      .mockResolvedValueOnce({ text: 'end' });

    await orchestrator.run('go', makeContext());
    expect(mocks.planningPort.advanceStep).toHaveBeenCalledTimes(2);
  });

  // 13. Trims history and rebuilds config each iteration
  it('trims history and rebuilds config each iteration', async () => {
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't1', args: {} }] })
      .mockResolvedValueOnce({ text: 'end' });

    await orchestrator.run('go', makeContext());
    expect(mocks.mockChat.trimHistory).toHaveBeenCalledTimes(1);
    // buildConfig called once initially + once per iteration
    expect(mocks.buildConfig).toHaveBeenCalledTimes(2);
  });

  // 14. Stops after explicit maxIterations
  it('stops after explicit maxIterations', async () => {
    const orch = new AgentOrchestrator({
      ...makeDeps(mocks),
      limits: { maxIterations: 10 },
    });
    // Always return function calls so the loop never exits early
    mocks.mockChat.sendMessage.mockResolvedValue({
      functionCalls: [{ id: 'fc', name: 't', args: {} }],
    });

    const result = await orch.run('go', makeContext());
    // 1 initial call + 10 iteration calls = 11 total
    expect(mocks.mockChat.sendMessage).toHaveBeenCalledTimes(11);
    expect(result.stepsCompleted).toBe(10);
  });

  // 15. Returns warning message at max iterations
  it('returns warning message at max iterations', async () => {
    const orch = new AgentOrchestrator({
      ...makeDeps(mocks),
      limits: { maxIterations: 5 },
    });
    mocks.mockChat.sendMessage.mockResolvedValue({
      functionCalls: [{ id: 'fc', name: 't', args: {} }],
    });

    const result = await orch.run('go', makeContext());
    expect(result.text).toBe('⚠️ Reached maximum tool iterations.');
  });

  // 16. Uses mentionContext tabId when available
  it('uses mentionContext tabId when available', async () => {
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
      .mockResolvedValueOnce({ text: 'ok' });

    const ctx = makeContext({ mentionContexts: [{ tabId: 42 }] as any });
    await orchestrator.run('go', ctx);
    expect(mocks.toolPort.execute).toHaveBeenCalledWith('t', {}, { tabId: 42, originTabId: 1 });
  });

  // 17. Uses context.tabId when no mentionContexts
  it('uses context.tabId when no mentionContexts', async () => {
    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
      .mockResolvedValueOnce({ text: 'ok' });

    await orchestrator.run('go', makeContext({ tabId: 5, mentionContexts: undefined as any }));
    expect(mocks.toolPort.execute).toHaveBeenCalledWith('t', {}, { tabId: 5, originTabId: 5 });
  });

  // 18. Dispose sets chat to null
  it('dispose sets chat to null', async () => {
    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'hi' });
    await orchestrator.run('hi', makeContext());
    await orchestrator.dispose();
    // Verify dispose completes without error (chat is private, so we just confirm no throw)
    await expect(orchestrator.dispose()).resolves.toBeUndefined();
  });

  // 19. Handles empty functionCalls array (same as no calls)
  it('handles empty functionCalls array as no calls', async () => {
    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'empty', functionCalls: [] });
    const result = await orchestrator.run('go', makeContext());
    expect(result.text).toBe('empty');
    expect(result.toolCalls).toEqual([]);
  });

  // 20. Preserves reasoning from AI response
  it('preserves reasoning from AI response', async () => {
    mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'answer', reasoning: 'I thought about it' });
    const result = await orchestrator.run('think', makeContext());
    expect(result.reasoning).toBe('I thought about it');
  });

  // Timeout test using performance.now spy
  it('breaks loop on timeout', async () => {
    const orch = new AgentOrchestrator({
      ...makeDeps(mocks),
      limits: { loopTimeoutMs: 60_000 },
    });
    let callCount = 0;
    const spy = vi.spyOn(performance, 'now');
    // First call is before the loop; subsequent calls inside the loop exceed timeout
    spy.mockImplementation(() => {
      callCount++;
      // First call (loopStart) returns 0, second call (inside while) returns past timeout
      return callCount <= 1 ? 0 : 70_000;
    });

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
      .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] });

    const result = await orch.run('go', makeContext());
    // Should have broken out due to timeout after first iteration's check
    expect(result.text).toContain('Reached maximum tool iterations');
    spy.mockRestore();
  });

  // ── Observer (onEvent) ──

  describe('onEvent observer', () => {
    it('emits ai_response when no function calls', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello!', reasoning: 'thought' });
      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('hi', makeContext());

      expect(events).toEqual([
        { type: 'ai_response', text: 'Hello!', reasoning: 'thought' },
      ]);
    });

    it('emits tool_call and tool_result on successful execution', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'media.play', args: { speed: 2 } }] })
        .mockResolvedValueOnce({ text: 'Done' });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'played' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('play', makeContext());

      expect(events[0]).toEqual({ type: 'tool_call', name: 'media.play', args: { speed: 2 } });
      expect(events[1]).toEqual({ type: 'tool_result', name: 'media.play', data: 'played', success: true });
      expect(events[2]).toEqual({ type: 'ai_response', text: 'Done', reasoning: undefined });
    });

    it('emits tool_result with success:false on failed execution', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'media.play', args: {} }] })
        .mockResolvedValueOnce({ text: 'Sorry' });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: false, error: 'not found' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('play', makeContext());

      expect(events[1]).toEqual({ type: 'tool_result', name: 'media.play', data: 'not found', success: false });
    });

    it('emits tool_error on exception', async () => {
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'media.play', args: {} }] })
        .mockResolvedValueOnce({ text: 'Error handled' });
      mocks.toolPort.execute.mockRejectedValueOnce(new Error('Tab crashed'));

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('play', makeContext());

      expect(events[0]).toEqual({ type: 'tool_call', name: 'media.play', args: {} });
      expect(events[1]).toEqual({ type: 'tool_error', name: 'media.play', error: 'Tab crashed' });
    });

    it('emits navigation event', async () => {
      mockedIsNavigationTool.mockReturnValue(true);
      mockedWaitForPageAndRescan.mockResolvedValue({ pageContext: null, tools: [] });
      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 'nav.goto', args: {} }] })
        .mockResolvedValueOnce({ text: 'Navigated' });
      mocks.toolPort.execute.mockResolvedValueOnce({ success: true, data: 'ok' });

      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('navigate', makeContext());

      expect(events).toContainEqual({ type: 'navigation', toolName: 'nav.goto' });
    });

    it('emits timeout event', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { loopTimeoutMs: 60_000 },
      });
      let callCount = 0;
      const spy = vi.spyOn(performance, 'now');
      spy.mockImplementation(() => (++callCount <= 1 ? 0 : 70_000));

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] });

      const events: any[] = [];
      orch.onEvent((e) => events.push(e));

      await orch.run('go', makeContext());

      expect(events).toContainEqual({ type: 'timeout' });
      spy.mockRestore();
    });

    it('emits max_iterations event', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { maxIterations: 5 },
      });
      mocks.mockChat.sendMessage.mockResolvedValue({
        functionCalls: [{ id: 'fc', name: 'tool', args: {} }],
      });

      const events: any[] = [];
      orch.onEvent((e) => events.push(e));

      await orch.run('go', makeContext());

      expect(events).toContainEqual({ type: 'max_iterations' });
    });

    it('unsubscribe stops receiving events', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });
      const events: any[] = [];
      const unsub = orchestrator.onEvent((e) => events.push(e));
      unsub();

      await orchestrator.run('hi', makeContext());

      expect(events).toEqual([]);
    });

    it('isolates listener errors', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });
      const events: any[] = [];
      orchestrator.onEvent(() => { throw new Error('boom'); });
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('hi', makeContext());

      expect(events.length).toBe(1);
    });

    it('dispose clears listeners', async () => {
      const events: any[] = [];
      orchestrator.onEvent((e) => events.push(e));

      await orchestrator.dispose();

      // Run the SAME disposed instance — chatFactory creates a new chat
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });
      await orchestrator.run('hi', makeContext());

      // Listener was cleared by dispose — should receive nothing
      expect(events).toEqual([]);
    });

    it('listener during emit unsub does not skip others', async () => {
      mocks.mockChat.sendMessage.mockResolvedValueOnce({ text: 'Hello' });
      const events: any[] = [];
      let unsub2: () => void;

      // Listener A unsubscribes listener B mid-emit
      orchestrator.onEvent(() => { unsub2(); });
      unsub2 = orchestrator.onEvent((e) => events.push(e));

      await orchestrator.run('hi', makeContext());

      // Listener B should still fire because emit snapshots the set
      expect(events.length).toBe(1);
    });
  });

  // ── Configurable limits ──

  describe('configurable limits', () => {
    it('respects custom maxIterations', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { maxIterations: 3 },
      });
      mocks.mockChat.sendMessage.mockResolvedValue({
        functionCalls: [{ id: 'fc', name: 't', args: {} }],
      });

      const result = await orch.run('go', makeContext());
      // 1 initial + 3 iterations = 4 total
      expect(mocks.mockChat.sendMessage).toHaveBeenCalledTimes(4);
      expect(result.stepsCompleted).toBe(3);
    });

    it('respects custom loopTimeoutMs', async () => {
      const orch = new AgentOrchestrator({
        ...makeDeps(mocks),
        limits: { loopTimeoutMs: 5_000 },
      });

      let callCount = 0;
      const spy = vi.spyOn(performance, 'now');
      spy.mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? 0 : 6_000;
      });

      mocks.mockChat.sendMessage
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc1', name: 't', args: {} }] })
        .mockResolvedValueOnce({ functionCalls: [{ id: 'fc2', name: 't', args: {} }] });

      const result = await orch.run('go', makeContext());
      expect(result.text).toContain('Reached maximum tool iterations');
      spy.mockRestore();
    });

    it('defaults to unlimited iterations (0)', async () => {
      // With default limits (0 = unlimited), loop runs until AI stops returning tool calls
      let callCount = 0;
      mocks.mockChat.sendMessage.mockImplementation(async () => {
        callCount++;
        // Initial call is callCount=1, then iterations count from 2
        if (callCount <= 21) {
          return { functionCalls: [{ id: `fc${callCount}`, name: 't', args: {} }] };
        }
        return { text: 'Done after many iterations' };
      });

      const result = await orchestrator.run('go', makeContext());
      // Should have gone past old default of 10 — proving unlimited works
      expect(result.stepsCompleted).toBeGreaterThan(10);
      expect(result.text).toBe('Done after many iterations');
    });
  });
});
