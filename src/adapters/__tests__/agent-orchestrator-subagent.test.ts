/**
 * Tests for SubagentAdapter wiring in AgentOrchestrator.
 * Validates delegate_task handling, event emission, and max concurrency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator, type OrchestratorDeps } from '../agent-orchestrator';
import type { AgentContext } from '../../ports/types';
import type { ISubagentPort } from '../../ports/subagent.port';
import type { ParsedFunctionCall, PageContext, CleanTool, ToolResponse } from '../../types';

vi.mock('../../sidebar/tool-loop', () => ({
  isNavigationTool: vi.fn(() => false),
  waitForPageAndRescan: vi.fn(),
}));

vi.mock('../../sidebar/debug-logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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
  };
  const chatFactory = vi.fn(() => mockChat as any);
  const buildConfig = vi.fn().mockReturnValue({ model: 'test' });

  return { toolPort, planningPort, mockChat, chatFactory, buildConfig };
}

function createSubagentPort(): ISubagentPort {
  return {
    spawn: vi.fn().mockResolvedValue({
      subagentId: 'sub_123',
      text: 'subtask done',
      success: true,
      stepsCompleted: 2,
    }),
    getActiveSubagents: vi.fn().mockReturnValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(mocks: ReturnType<typeof createMocks>, subagentPort?: ISubagentPort): OrchestratorDeps {
  return {
    toolPort: mocks.toolPort as any,
    contextPort: {} as any,
    planningPort: mocks.planningPort as any,
    chatFactory: mocks.chatFactory,
    buildConfig: mocks.buildConfig,
    ...(subagentPort ? { subagentPort } : {}),
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

describe('AgentOrchestrator — Subagent wiring', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = createMocks();
  });

  it('delegates delegate_task to subagentPort and returns result', async () => {
    const subagentPort = createSubagentPort();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Do subtask' } }],
      })
      .mockResolvedValueOnce({ text: 'All done' });

    const result = await orchestrator.run('delegate something', makeContext());

    expect(subagentPort.spawn).toHaveBeenCalledOnce();
    expect(subagentPort.spawn).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Do subtask',
    }));
    expect(result.text).toBe('All done');
  });

  it('emits subagent:started and subagent:completed events on success', async () => {
    const subagentPort = createSubagentPort();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));
    const events: Array<{ type: string }> = [];

    orchestrator.onEvent((event) => events.push(event));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Do subtask' } }],
      })
      .mockResolvedValueOnce({ text: 'Done' });

    await orchestrator.run('go', makeContext());

    expect(events.some(e => e.type === 'subagent_started')).toBe(true);
    expect(events.some(e => e.type === 'subagent_completed')).toBe(true);
  });

  it('emits subagent:failed event when subagent fails', async () => {
    const subagentPort = createSubagentPort();
    vi.mocked(subagentPort.spawn).mockResolvedValueOnce({
      subagentId: 'sub_fail',
      text: '',
      success: false,
      stepsCompleted: 0,
      error: 'Max concurrent subagents (3) reached',
    });
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));
    const events: Array<{ type: string }> = [];

    orchestrator.onEvent((event) => events.push(event));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Too many' } }],
      })
      .mockResolvedValueOnce({ text: 'Failed' });

    await orchestrator.run('go', makeContext());

    expect(events.some(e => e.type === 'subagent_failed')).toBe(true);
    const failEvent = events.find(e => e.type === 'subagent_failed') as any;
    expect(failEvent.error).toBe('Max concurrent subagents (3) reached');
  });

  it('feeds subagent result back as tool response to AI', async () => {
    const subagentPort = createSubagentPort();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Subtask' } }],
      })
      .mockResolvedValueOnce({ text: 'Final' });

    await orchestrator.run('go', makeContext());

    // Second sendMessage call should include the subagent result
    const secondCall = mocks.mockChat.sendMessage.mock.calls[1];
    const toolResponses = secondCall[0].message as ToolResponse[];
    expect(toolResponses).toHaveLength(1);
    expect(toolResponses[0].functionResponse.name).toBe('delegate_task');
    expect(toolResponses[0].functionResponse.response).toEqual({ result: 'subtask done' });
  });

  it('feeds error back as tool response when subagent fails', async () => {
    const subagentPort = createSubagentPort();
    vi.mocked(subagentPort.spawn).mockResolvedValueOnce({
      subagentId: 'sub_err',
      text: '',
      success: false,
      stepsCompleted: 0,
      error: 'Subagent cancelled',
    });
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Cancel me' } }],
      })
      .mockResolvedValueOnce({ text: 'Handled' });

    await orchestrator.run('go', makeContext());

    const secondCall = mocks.mockChat.sendMessage.mock.calls[1];
    const toolResponses = secondCall[0].message as ToolResponse[];
    expect(toolResponses[0].functionResponse.response).toEqual({ error: 'Subagent cancelled' });
  });

  it('falls through to regular tool execution when no subagentPort is wired', async () => {
    // No subagentPort provided
    const orchestrator = new AgentOrchestrator(makeDeps(mocks));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Subtask' } }],
      })
      .mockResolvedValueOnce({ text: 'Done' });

    await orchestrator.run('go', makeContext());

    // Should be executed as a regular tool
    expect(mocks.toolPort.execute).toHaveBeenCalledWith('delegate_task', { prompt: 'Subtask' }, expect.any(Object));
  });

  it('passes tools and context to subagent spawn', async () => {
    const subagentPort = createSubagentPort();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Do it', timeoutMs: 5000 } }],
      })
      .mockResolvedValueOnce({ text: 'Done' });

    await orchestrator.run('go', makeContext());

    const spawnCall = vi.mocked(subagentPort.spawn).mock.calls[0][0];
    expect(spawnCall.timeoutMs).toBe(5000);
    expect(spawnCall.tools).toEqual([{ name: 'tool1' }]);
    expect(spawnCall.context).toEqual(expect.objectContaining({
      tabId: 1,
      pageContext: expect.objectContaining({ url: 'https://example.com' }),
    }));
  });

  it('does not count delegate_task as regular tool call in records', async () => {
    const subagentPort = createSubagentPort();
    const orchestrator = new AgentOrchestrator(makeDeps(mocks, subagentPort));

    mocks.mockChat.sendMessage
      .mockResolvedValueOnce({
        functionCalls: [{ id: 'fc1', name: 'delegate_task', args: { prompt: 'Sub' } }],
      })
      .mockResolvedValueOnce({ text: 'Done' });

    const result = await orchestrator.run('go', makeContext());

    // delegate_task should not appear in toolCalls since it's handled locally
    expect(result.toolCalls).toEqual([]);
    // Regular tool port should NOT be called
    expect(mocks.toolPort.execute).not.toHaveBeenCalled();
  });
});
