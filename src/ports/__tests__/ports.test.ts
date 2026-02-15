/**
 * Contract tests for hexagonal port interfaces.
 *
 * Verifies each port interface can be implemented with mock adapters
 * and that types are compatible with the existing domain types.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IAgentPort } from '../agent.port';
import type { IToolExecutionPort } from '../tool-execution.port';
import type { IPlanningPort } from '../planning.port';
import type { ISubagentPort } from '../subagent.port';
import type { IContextPort } from '../context.port';
import type {
  AgentContext,
  AgentResult,
  ToolCallResult,
  ToolDefinition,
  ToolTarget,
  SubagentTask,
  SubagentResult,
  SubagentInfo,
  Plan,
  PlanStep,
  PageContext,
  LiveStateSnapshot,
  Message,
  ContextSummary,
} from '../types';

// ── Mock Factories ──

function makePageContext(): PageContext {
  return { url: 'https://example.com', title: 'Example' };
}

function makeLiveState(): LiveStateSnapshot {
  return {
    timestamp: Date.now(),
    media: [],
    forms: [],
    navigation: { currentUrl: 'https://example.com', scrollPercent: 0 },
    auth: { isLoggedIn: false, hasLoginForm: false, hasLogoutButton: false },
    interactive: {
      openModals: [],
      expandedAccordions: [],
      openDropdowns: [],
      activeTooltips: [],
      visibleNotifications: [],
    },
    visibility: { overlays: [], loadingIndicators: false },
  };
}

function makeAgentContext(): AgentContext {
  return {
    pageContext: makePageContext(),
    tools: [],
    conversationHistory: [],
    liveState: null,
    tabId: 1,
  };
}

function makeToolDefinition(): ToolDefinition {
  return {
    name: 'click_button',
    description: 'Click a button',
    parametersSchema: { type: 'object', properties: {} },
  };
}

function makePlanStep(id: string, title: string): PlanStep {
  return { id, title, status: 'pending' };
}

// ── IAgentPort ──

describe('IAgentPort', () => {
  function createMockAgent(): IAgentPort {
    return {
      run: vi.fn(async (_prompt, _ctx): Promise<AgentResult> => ({
        text: 'Done',
        toolCalls: [],
        updatedTools: [],
        updatedPageContext: null,
        stepsCompleted: 1,
      })),
      dispose: vi.fn(async () => {}),
    };
  }

  it('should execute a prompt and return an AgentResult', async () => {
    const agent = createMockAgent();
    const result = await agent.run('Hello', makeAgentContext());

    expect(result.text).toBe('Done');
    expect(result.toolCalls).toEqual([]);
    expect(result.stepsCompleted).toBe(1);
    expect(agent.run).toHaveBeenCalledOnce();
  });

  it('should support dispose lifecycle', async () => {
    const agent = createMockAgent();
    await agent.dispose();
    expect(agent.dispose).toHaveBeenCalledOnce();
  });
});

// ── IToolExecutionPort ──

describe('IToolExecutionPort', () => {
  function createMockToolExecution(): IToolExecutionPort {
    const listeners: Array<(tools: readonly ToolDefinition[]) => void> = [];
    return {
      execute: vi.fn(async (_name, _args, _target): Promise<ToolCallResult> => ({
        success: true,
        data: { clicked: true },
      })),
      getAvailableTools: vi.fn(async (_tabId): Promise<readonly ToolDefinition[]> => [
        makeToolDefinition(),
      ]),
      onToolsChanged: vi.fn((cb) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      }),
    };
  }

  it('should execute a tool and return a result', async () => {
    const executor = createMockToolExecution();
    const target: ToolTarget = { tabId: 1 };
    const result = await executor.execute('click_button', { selector: '#btn' }, target);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ clicked: true });
  });

  it('should list available tools', async () => {
    const executor = createMockToolExecution();
    const tools = await executor.getAvailableTools(1);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('click_button');
  });

  it('should support onToolsChanged subscription and unsubscription', () => {
    const executor = createMockToolExecution();
    const cb = vi.fn();
    const unsubscribe = executor.onToolsChanged(cb);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});

// ── IPlanningPort ──

describe('IPlanningPort', () => {
  function createMockPlanning(): IPlanningPort {
    let plan: Plan | null = null;
    const listeners: Array<(p: Plan | null) => void> = [];

    return {
      createPlan: vi.fn((goal, steps): Plan => {
        plan = { goal, steps, createdAt: Date.now(), status: 'pending' };
        listeners.forEach((cb) => cb(plan));
        return plan;
      }),
      updatePlan: vi.fn((goal, steps): Plan => {
        plan = { goal, steps, createdAt: plan?.createdAt ?? Date.now(), status: 'pending' };
        listeners.forEach((cb) => cb(plan));
        return plan;
      }),
      getCurrentPlan: vi.fn(() => plan),
      advanceStep: vi.fn(),
      markStepDone: vi.fn(),
      markStepFailed: vi.fn(),
      onPlanChanged: vi.fn((cb) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      }),
    };
  }

  it('should create a plan with steps', () => {
    const planning = createMockPlanning();
    const steps = [makePlanStep('s1', 'Step 1'), makePlanStep('s2', 'Step 2')];
    const plan = planning.createPlan('Test goal', steps);

    expect(plan.goal).toBe('Test goal');
    expect(plan.steps).toHaveLength(2);
    expect(plan.status).toBe('pending');
  });

  it('should return null when no plan exists', () => {
    const planning = createMockPlanning();
    expect(planning.getCurrentPlan()).toBeNull();
  });

  it('should notify listeners on plan change', () => {
    const planning = createMockPlanning();
    const cb = vi.fn();
    planning.onPlanChanged(cb);
    planning.createPlan('Goal', [makePlanStep('s1', 'Step 1')]);

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]?.goal).toBe('Goal');
  });
});

// ── ISubagentPort ──

describe('ISubagentPort', () => {
  function createMockSubagent(): ISubagentPort {
    const active: SubagentInfo[] = [];

    return {
      spawn: vi.fn(async (task: SubagentTask): Promise<SubagentResult> => {
        const id = `sub-${Date.now()}`;
        active.push({ id, task: task.prompt, startedAt: Date.now(), status: 'running' });
        return {
          subagentId: id,
          text: 'Subtask done',
          success: true,
          stepsCompleted: 1,
        };
      }),
      getActiveSubagents: vi.fn(() => active as readonly SubagentInfo[]),
      cancel: vi.fn(async (subagentId: string) => {
        const idx = active.findIndex((s) => s.id === subagentId);
        if (idx >= 0) active.splice(idx, 1);
      }),
    };
  }

  it('should spawn a subagent and return a result', async () => {
    const port = createMockSubagent();
    const result = await port.spawn({ prompt: 'Do subtask' });

    expect(result.success).toBe(true);
    expect(result.text).toBe('Subtask done');
    expect(result.subagentId).toBeDefined();
  });

  it('should list active subagents after spawn', async () => {
    const port = createMockSubagent();
    await port.spawn({ prompt: 'Task A' });

    const agents = port.getActiveSubagents();
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe('running');
  });

  it('should cancel a running subagent', async () => {
    const port = createMockSubagent();
    const result = await port.spawn({ prompt: 'Task B' });
    await port.cancel(result.subagentId);

    expect(port.getActiveSubagents()).toHaveLength(0);
  });
});

// ── IContextPort ──

describe('IContextPort', () => {
  function createMockContext(): IContextPort {
    return {
      getPageContext: vi.fn(async (_tabId): Promise<PageContext | null> => makePageContext()),
      getLiveState: vi.fn((): LiveStateSnapshot | null => makeLiveState()),
      getConversationHistory: vi.fn((): readonly Message[] => [
        { role: 'user', content: 'Hello' },
        { role: 'ai', content: 'Hi!' },
      ]),
      summarizeIfNeeded: vi.fn(
        async (msgs, budget): Promise<ContextSummary> => ({
          originalCount: msgs.length,
          compressedCount: Math.min(msgs.length, budget),
          summary: 'Summarized conversation',
        }),
      ),
    };
  }

  it('should return page context for a tab', async () => {
    const ctx = createMockContext();
    const page = await ctx.getPageContext(1);

    expect(page).not.toBeNull();
    expect(page!.url).toBe('https://example.com');
    expect(page!.title).toBe('Example');
  });

  it('should return live state snapshot', () => {
    const ctx = createMockContext();
    const state = ctx.getLiveState();

    expect(state).not.toBeNull();
    expect(state!.timestamp).toBeGreaterThan(0);
    expect(state!.navigation.currentUrl).toBe('https://example.com');
  });

  it('should return conversation history', () => {
    const ctx = createMockContext();
    const history = ctx.getConversationHistory();

    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
  });

  it('should summarize messages when needed', async () => {
    const ctx = createMockContext();
    const msgs: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'ai', content: 'Hi!' },
    ];
    const summary = await ctx.summarizeIfNeeded(msgs, 100);

    expect(summary.originalCount).toBe(2);
    expect(summary.summary).toBe('Summarized conversation');
  });
});

// ── Cross-port type compatibility ──

describe('Cross-port type compatibility', () => {
  it('should use shared PageContext across IContextPort and IAgentPort', async () => {
    const contextPort: IContextPort = {
      getPageContext: async () => makePageContext(),
      getLiveState: () => null,
      getConversationHistory: () => [],
      summarizeIfNeeded: async (msgs) => ({
        originalCount: msgs.length,
        compressedCount: msgs.length,
        summary: '',
      }),
    };

    const page = await contextPort.getPageContext(1);

    const agentContext: AgentContext = {
      pageContext: page,
      tools: [],
      conversationHistory: [],
      liveState: null,
      tabId: 1,
    };

    expect(agentContext.pageContext).toEqual(page);
  });

  it('should use shared ToolDefinition across IToolExecutionPort and AgentContext', async () => {
    const tool = makeToolDefinition();
    const executor: IToolExecutionPort = {
      execute: async () => ({ success: true }),
      getAvailableTools: async () => [tool],
      onToolsChanged: () => () => {},
    };

    const tools = await executor.getAvailableTools(1);
    expect(tools[0].name).toBe(tool.name);
    expect(tools[0].parametersSchema).toBeDefined();
  });

  it('should use shared Plan type across IPlanningPort and AgentResult', () => {
    const planning: IPlanningPort = {
      createPlan: (goal, steps) => ({ goal, steps, createdAt: Date.now(), status: 'pending' }),
      updatePlan: (goal, steps) => ({ goal, steps, createdAt: Date.now(), status: 'pending' }),
      getCurrentPlan: () => null,
      advanceStep: () => {},
      markStepDone: () => {},
      markStepFailed: () => {},
      onPlanChanged: () => () => {},
    };

    const plan = planning.createPlan('Goal', [makePlanStep('s1', 'Step')]);
    expect(plan.goal).toBe('Goal');
    expect(plan.steps[0].status).toBe('pending');
  });
});
