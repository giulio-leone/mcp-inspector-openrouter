import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationPlanAdapter, resolveTemplate } from '../navigation-plan-adapter';
import type { NavigationStep, StepResult } from '../../ports/navigation-plan.port';

/** Helper to build a minimal step with defaults */
function makeStep(overrides: Partial<NavigationStep> & { id: string; type: NavigationStep['type'] }): NavigationStep {
  const base = {
    description: `Step ${overrides.id}`,
    preconditions: [],
    onError: 'abort' as const,
    maxRetries: 0,
    ...overrides,
  };

  switch (base.type) {
    case 'open-tab':
      return { ...base, type: 'open-tab', url: 'https://example.com' } as NavigationStep;
    case 'navigate':
      return { ...base, type: 'navigate', tabId: 1, url: 'https://example.com' } as NavigationStep;
    case 'extract':
      return { ...base, type: 'extract', tabId: 1, selector: '.result', dataKey: 'result' } as NavigationStep;
    case 'fill':
      return { ...base, type: 'fill', tabId: 1, selector: '#input', value: 'test' } as NavigationStep;
    case 'wait':
      return { ...base, type: 'wait', tabId: 1, condition: 'page-load', target: '' } as NavigationStep;
    case 'close-tab':
      return { ...base, type: 'close-tab', tabId: 1 } as NavigationStep;
    default:
      return base as NavigationStep;
  }
}

function completedResult(stepId: string, data?: unknown): StepResult {
  return { stepId, status: 'completed', retryCount: 0, data };
}

function failedResult(stepId: string, retryCount = 0): StepResult {
  return { stepId, status: 'failed', error: 'something went wrong', retryCount };
}

describe('NavigationPlanAdapter', () => {
  let adapter: NavigationPlanAdapter;

  beforeEach(() => {
    adapter = new NavigationPlanAdapter();
  });

  // ── createPlan ──

  it('createPlan creates valid plan with running state', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab' }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    const plan = adapter.createPlan('Test plan', steps);

    expect(plan.id).toBeDefined();
    expect(plan.description).toBe('Test plan');
    expect(plan.steps).toHaveLength(2);

    const state = adapter.getState();
    expect(state).not.toBeNull();
    expect(state!.planId).toBe(plan.id);
    expect(state!.currentStepIndex).toBe(0);
    expect(state!.results).toHaveLength(0);
    expect(state!.status).toBe('running');
  });

  // ── getCurrentStep ──

  it('getCurrentStep returns first step after creation', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab' }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    adapter.createPlan('Test', steps);

    const step = adapter.getCurrentStep();
    expect(step).not.toBeNull();
    expect(step!.id).toBe('s1');
  });

  it('getCurrentStep returns null when no plan', () => {
    expect(adapter.getCurrentStep()).toBeNull();
  });

  // ── advanceStep ──

  it('advanceStep with completed result moves to next step', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab' }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    adapter.createPlan('Test', steps);

    adapter.advanceStep(completedResult('s1'));

    const step = adapter.getCurrentStep();
    expect(step).not.toBeNull();
    expect(step!.id).toBe('s2');
    expect(adapter.getState()!.results).toHaveLength(1);
  });

  it('advanceStep completes plan when last step done', () => {
    const steps: NavigationStep[] = [makeStep({ id: 's1', type: 'open-tab' })];
    adapter.createPlan('Test', steps);

    adapter.advanceStep(completedResult('s1'));

    const state = adapter.getState();
    expect(state!.status).toBe('completed');
    expect(state!.currentStepIndex).toBe(1);
    expect(adapter.getCurrentStep()).toBeNull();
  });

  // ── Error Strategies ──

  it('retry strategy retries on failure (does not advance)', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab', onError: 'retry', maxRetries: 3 }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    adapter.createPlan('Test', steps);

    adapter.advanceStep(failedResult('s1', 0));

    expect(adapter.getState()!.currentStepIndex).toBe(0);
    expect(adapter.getCurrentStep()!.id).toBe('s1');
    expect(adapter.getState()!.status).toBe('running');
  });

  it('retry strategy advances after maxRetries exceeded', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab', onError: 'retry', maxRetries: 2 }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    adapter.createPlan('Test', steps);

    adapter.advanceStep(failedResult('s1', 2));

    expect(adapter.getState()!.currentStepIndex).toBe(1);
    expect(adapter.getCurrentStep()!.id).toBe('s2');
  });

  it('skip strategy advances on failure', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab', onError: 'skip' }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    adapter.createPlan('Test', steps);

    adapter.advanceStep(failedResult('s1'));

    expect(adapter.getState()!.currentStepIndex).toBe(1);
    expect(adapter.getCurrentStep()!.id).toBe('s2');
  });

  it('abort strategy sets plan to failed', () => {
    const steps: NavigationStep[] = [
      makeStep({ id: 's1', type: 'open-tab', onError: 'abort' }),
      makeStep({ id: 's2', type: 'navigate' }),
    ];
    adapter.createPlan('Test', steps);

    adapter.advanceStep(failedResult('s1'));

    expect(adapter.getState()!.status).toBe('failed');
  });

  // ── abort ──

  it('abort() sets plan to aborted', () => {
    const steps: NavigationStep[] = [makeStep({ id: 's1', type: 'open-tab' })];
    adapter.createPlan('Test', steps);

    adapter.abort('user cancelled');

    expect(adapter.getState()!.status).toBe('aborted');
  });

  // ── reset ──

  it('reset() clears everything', () => {
    const steps: NavigationStep[] = [makeStep({ id: 's1', type: 'open-tab' })];
    adapter.createPlan('Test', steps);

    adapter.reset();

    expect(adapter.getState()).toBeNull();
    expect(adapter.getCurrentStep()).toBeNull();
  });

  // ── getState ──

  it('getState returns null before createPlan', () => {
    expect(adapter.getState()).toBeNull();
  });
});

// ── resolveTemplate ──

describe('resolveTemplate', () => {
  it('replaces ${dataKey} with extracted data from previous results', () => {
    const results: StepResult[] = [
      { stepId: 's1', status: 'completed', retryCount: 0, data: { query: 'hello world' } },
    ];
    const resolved = resolveTemplate('Search for ${query}', results);
    expect(resolved).toBe('Search for hello world');
  });

  it('leaves unresolved placeholders unchanged', () => {
    const results: StepResult[] = [];
    const resolved = resolveTemplate('Value is ${missing}', results);
    expect(resolved).toBe('Value is ${missing}');
  });

  it('ignores data from failed steps', () => {
    const results: StepResult[] = [
      { stepId: 's1', status: 'failed', retryCount: 0, data: { query: 'nope' } },
    ];
    const resolved = resolveTemplate('${query}', results);
    expect(resolved).toBe('${query}');
  });

  it('resolves from multiple results', () => {
    const results: StepResult[] = [
      { stepId: 's1', status: 'completed', retryCount: 0, data: { a: 'foo' } },
      { stepId: 's2', status: 'completed', retryCount: 0, data: { b: 'bar' } },
    ];
    const resolved = resolveTemplate('${a} and ${b}', results);
    expect(resolved).toBe('foo and bar');
  });
});

describe('edge cases', () => {
  let edgeAdapter: NavigationPlanAdapter;

  beforeEach(() => {
    edgeAdapter = new NavigationPlanAdapter();
  });

  it('empty steps array creates completed plan', () => {
    const plan = edgeAdapter.createPlan('empty', []);
    expect(plan.steps).toHaveLength(0);
    const state = edgeAdapter.getState();
    expect(state?.status).toBe('completed');
    expect(edgeAdapter.getCurrentStep()).toBeNull();
  });

  it('advanceStep ignores mismatched stepId', () => {
    edgeAdapter.createPlan('test', [
      makeStep({ id: 's1', type: 'open-tab' }),
      makeStep({ id: 's2', type: 'navigate' }),
    ]);
    edgeAdapter.advanceStep({ stepId: 'wrong-id', status: 'completed', retryCount: 0 });
    expect(edgeAdapter.getState()?.currentStepIndex).toBe(0);
    expect(edgeAdapter.getCurrentStep()?.id).toBe('s1');
  });
});
