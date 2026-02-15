import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowAdapter } from '../workflow-adapter';
import type {
  WorkflowDef,
  WorkflowContextMap,
  WorkflowRunEvent,
  WorkflowStepDef,
} from '../../ports/workflow.port';

// ── Helpers ──

function makeStep(
  id: string,
  name: string,
  fn: (ctx: WorkflowContextMap) => Promise<WorkflowContextMap>,
): WorkflowStepDef {
  return { id, name, execute: fn };
}

function makeWorkflow(
  steps: WorkflowStepDef[],
  opts?: Partial<Omit<WorkflowDef, 'steps'>>,
): WorkflowDef {
  return {
    id: opts?.id ?? 'wf-1',
    name: opts?.name ?? 'Test Workflow',
    steps,
    initialContext: opts?.initialContext,
    maxDurationMs: opts?.maxDurationMs,
  };
}

describe('WorkflowAdapter', () => {
  let adapter: WorkflowAdapter;

  beforeEach(() => {
    adapter = new WorkflowAdapter();
  });

  // ── Basic Execution ──

  it('executes an empty workflow with completed status', async () => {
    const result = await adapter.execute(makeWorkflow([]));
    expect(result.status).toBe('completed');
    expect(result.completedSteps).toEqual([]);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('executes a single step successfully', async () => {
    const step = makeStep('s1', 'Step 1', async (ctx) => ({
      ...ctx,
      done: true,
    }));
    const result = await adapter.execute(makeWorkflow([step]));
    expect(result.status).toBe('completed');
    expect(result.completedSteps).toEqual(['s1']);
    expect(result.context).toEqual({ done: true });
  });

  it('executes multiple steps in order', async () => {
    const order: string[] = [];
    const s1 = makeStep('s1', 'First', async (ctx) => {
      order.push('s1');
      return { ...ctx, a: 1 };
    });
    const s2 = makeStep('s2', 'Second', async (ctx) => {
      order.push('s2');
      return { ...ctx, b: 2 };
    });
    const s3 = makeStep('s3', 'Third', async (ctx) => {
      order.push('s3');
      return { ...ctx, c: 3 };
    });

    const result = await adapter.execute(makeWorkflow([s1, s2, s3]));
    expect(result.status).toBe('completed');
    expect(order).toEqual(['s1', 's2', 's3']);
    expect(result.completedSteps).toEqual(['s1', 's2', 's3']);
    expect(result.context).toEqual({ a: 1, b: 2, c: 3 });
  });

  // ── Context Handling ──

  it('merges initialContext from definition with execute context', async () => {
    const step = makeStep('s1', 'Check', async (ctx) => ctx);
    const def = makeWorkflow([step], {
      initialContext: { fromDef: 'yes' },
    });
    const result = await adapter.execute(def, { fromCall: 'also' });
    expect(result.context).toEqual({ fromDef: 'yes', fromCall: 'also' });
  });

  it('execute context overrides initialContext for same keys', async () => {
    const step = makeStep('s1', 'Check', async (ctx) => ctx);
    const def = makeWorkflow([step], {
      initialContext: { key: 'initial' },
    });
    const result = await adapter.execute(def, { key: 'override' });
    expect(result.context).toEqual({ key: 'override' });
  });

  it('passes context from one step to the next', async () => {
    const s1 = makeStep('s1', 'Set', async () => ({ value: 42 }));
    const s2 = makeStep('s2', 'Read', async (ctx) => ({
      ...ctx,
      doubled: (ctx.value as number) * 2,
    }));
    const result = await adapter.execute(makeWorkflow([s1, s2]));
    expect(result.context).toEqual({ value: 42, doubled: 84 });
  });

  // ── Error Handling ──

  it('returns failed status when a step throws', async () => {
    const s1 = makeStep('s1', 'OK', async (ctx) => ({ ...ctx, ok: true }));
    const s2 = makeStep('s2', 'Fail', async () => {
      throw new Error('step failed');
    });
    const s3 = makeStep('s3', 'Skip', async (ctx) => ctx);

    const result = await adapter.execute(makeWorkflow([s1, s2, s3]));
    expect(result.status).toBe('failed');
    expect(result.completedSteps).toEqual(['s1']);
    expect(result.failedStep).toBe('s2');
    expect(result.error).toBe('step failed');
  });

  it('handles non-Error throws', async () => {
    const step = makeStep('s1', 'Bad', async () => {
      throw 'string error';
    });
    const result = await adapter.execute(makeWorkflow([step]));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('string error');
  });

  it('preserves context at point of failure', async () => {
    const s1 = makeStep('s1', 'Set', async () => ({ progress: 50 }));
    const s2 = makeStep('s2', 'Crash', async () => {
      throw new Error('crash');
    });
    const result = await adapter.execute(makeWorkflow([s1, s2]));
    expect(result.context).toEqual({ progress: 50 });
  });

  // ── Timeout ──

  it('fails with timeout when maxDurationMs exceeded', async () => {
    const s1 = makeStep('s1', 'Slow', async (ctx) => {
      await new Promise((r) => setTimeout(r, 50));
      return { ...ctx, done: true };
    });
    const s2 = makeStep('s2', 'After', async (ctx) => ctx);

    const def = makeWorkflow([s1, s2], { maxDurationMs: 10 });
    const result = await adapter.execute(def);

    // s1 might complete before the timeout check for s2
    expect(result.status).toBe('failed');
    expect(result.error).toContain('timed out');
  });

  it('completes when within timeout', async () => {
    const step = makeStep('s1', 'Fast', async (ctx) => ({
      ...ctx,
      done: true,
    }));
    const def = makeWorkflow([step], { maxDurationMs: 5000 });
    const result = await adapter.execute(def);
    expect(result.status).toBe('completed');
  });

  // ── Event Emission ──

  it('emits step:start and step:complete for successful steps', async () => {
    const events: WorkflowRunEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const step = makeStep('s1', 'Go', async (ctx) => ctx);
    await adapter.execute(makeWorkflow([step]));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('step:start');
    expect(events[0].stepId).toBe('s1');
    expect(events[0].stepName).toBe('Go');
    expect(events[1].type).toBe('step:complete');
    expect(events[1].stepId).toBe('s1');
  });

  it('emits step:error when a step fails', async () => {
    const events: WorkflowRunEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const step = makeStep('s1', 'Fail', async () => {
      throw new Error('boom');
    });
    await adapter.execute(makeWorkflow([step]));

    const errorEvents = events.filter((e) => e.type === 'step:error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].error).toBe('boom');
    expect(errorEvents[0].stepId).toBe('s1');
  });

  it('emits events for all steps in a multi-step workflow', async () => {
    const events: WorkflowRunEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const s1 = makeStep('s1', 'A', async (ctx) => ctx);
    const s2 = makeStep('s2', 'B', async (ctx) => ctx);
    await adapter.execute(makeWorkflow([s1, s2]));

    expect(events).toHaveLength(4); // 2 start + 2 complete
    expect(events.map((e) => `${e.type}:${e.stepId}`)).toEqual([
      'step:start:s1',
      'step:complete:s1',
      'step:start:s2',
      'step:complete:s2',
    ]);
  });

  it('includes context in start events', async () => {
    const events: WorkflowRunEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const step = makeStep('s1', 'Go', async (ctx) => ({
      ...ctx,
      added: true,
    }));
    await adapter.execute(makeWorkflow([step]), { initial: true });

    expect(events[0].context).toEqual({ initial: true });
    expect(events[1].context).toEqual({ initial: true, added: true });
  });

  // ── Listener Management ──

  it('supports unsubscribing from events', async () => {
    const events: WorkflowRunEvent[] = [];
    const unsub = adapter.onEvent((e) => events.push(e));

    const step = makeStep('s1', 'Go', async (ctx) => ctx);
    await adapter.execute(makeWorkflow([step]));
    expect(events.length).toBeGreaterThan(0);

    const countBefore = events.length;
    unsub();

    await adapter.execute(makeWorkflow([step]));
    expect(events.length).toBe(countBefore);
  });

  it('supports multiple listeners', async () => {
    const events1: WorkflowRunEvent[] = [];
    const events2: WorkflowRunEvent[] = [];
    adapter.onEvent((e) => events1.push(e));
    adapter.onEvent((e) => events2.push(e));

    const step = makeStep('s1', 'Go', async (ctx) => ctx);
    await adapter.execute(makeWorkflow([step]));

    expect(events1.length).toBe(2);
    expect(events2.length).toBe(2);
  });

  // ── Duration Tracking ──

  it('tracks totalDurationMs for completed workflows', async () => {
    const step = makeStep('s1', 'Wait', async (ctx) => {
      await new Promise((r) => setTimeout(r, 10));
      return ctx;
    });
    const result = await adapter.execute(makeWorkflow([step]));
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(5);
  });

  it('tracks totalDurationMs for failed workflows', async () => {
    const step = makeStep('s1', 'Fail', async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('fail');
    });
    const result = await adapter.execute(makeWorkflow([step]));
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(5);
  });

  // ── IWorkflowPort contract ──

  it('satisfies IWorkflowPort interface', () => {
    // Type-level check: adapter is assignable to the port interface
    const port: import('../../ports/workflow.port').IWorkflowPort = adapter;
    expect(typeof port.execute).toBe('function');
    expect(typeof port.onEvent).toBe('function');
  });

  // ── Edge Cases ──

  it('handles a step that returns empty context', async () => {
    const step = makeStep('s1', 'Empty', async () => ({}));
    const result = await adapter.execute(makeWorkflow([step]), {
      preserved: false,
    });
    expect(result.status).toBe('completed');
    expect(result.context).toEqual({});
  });

  it('handles workflow with undefined initialContext and no execute context', async () => {
    const step = makeStep('s1', 'Check', async (ctx) => ctx);
    const result = await adapter.execute(makeWorkflow([step]));
    expect(result.status).toBe('completed');
    expect(result.context).toEqual({});
  });

  it('events have valid timestamps', async () => {
    const events: WorkflowRunEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    const step = makeStep('s1', 'Go', async (ctx) => ctx);
    const before = Date.now();
    await adapter.execute(makeWorkflow([step]));
    const after = Date.now();

    for (const event of events) {
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    }
  });
});
