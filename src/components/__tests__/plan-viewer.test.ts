import { describe, it, expect, vi, afterEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  runtime: { getURL: vi.fn((p: string) => p) },
});

import '../plan-viewer';
import type { PlanViewer } from '../plan-viewer';
import type { Plan } from '../../types';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    goal: 'Test goal',
    steps: [
      { id: '1', title: 'Step one', status: 'pending' },
      { id: '2', title: 'Step two', status: 'pending' },
    ],
    createdAt: Date.now(),
    status: 'pending',
    ...overrides,
  };
}

async function createViewer(props: Partial<PlanViewer> = {}): Promise<PlanViewer> {
  const el = document.createElement('plan-viewer') as PlanViewer;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  await new Promise(r => setTimeout(r, 0));
  return el;
}

describe('PlanViewer', () => {
  let el: PlanViewer;

  afterEach(() => {
    el?.remove();
  });

  it('registers as custom element', () => {
    expect(customElements.get('plan-viewer')).toBeDefined();
  });

  it('renders plan with goal and steps', async () => {
    el = await createViewer({ plan: makePlan() });
    expect(el.querySelector('.plan-goal')?.textContent).toBe('Test goal');
    const steps = el.querySelectorAll('.plan-step');
    expect(steps.length).toBe(2);
    expect(steps[0].querySelector('.plan-step-title')?.textContent).toBe('1. Step one');
    expect(steps[1].querySelector('.plan-step-title')?.textContent).toBe('2. Step two');
  });

  it('renders collapsed state', async () => {
    el = await createViewer({ plan: makePlan(), collapsed: true });
    expect(el.querySelector('.plan-block--collapsed')).toBeTruthy();
  });

  it('updateStep changes step status and icon', async () => {
    el = await createViewer({ plan: makePlan() });
    el.updateStep('1', 'done', 'Completed');
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));

    const step1 = el.querySelector('[data-step-id="1"]');
    expect(step1?.classList.contains('plan-step--done')).toBe(true);
    expect(step1?.querySelector('.plan-step-detail')?.textContent).toBe('Completed');
  });

  it('auto-computes overall status', async () => {
    el = await createViewer({ plan: makePlan() });

    el.updateStep('1', 'done');
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    // One done, one pending → in_progress
    expect(el.plan!.status).toBe('in_progress');

    el.updateStep('2', 'done');
    await el.updateComplete;
    await new Promise(r => setTimeout(r, 0));
    expect(el.plan!.status).toBe('done');
  });

  it('renders nested children', async () => {
    const plan = makePlan({
      steps: [
        {
          id: '1',
          title: 'Parent',
          status: 'pending',
          children: [{ id: '1.1', title: 'Child', status: 'pending' }],
        },
      ],
    });
    el = await createViewer({ plan });
    expect(el.querySelector('.plan-step-children')).toBeTruthy();
    const child = el.querySelector('[data-step-id="1.1"]');
    expect(child).toBeTruthy();
    expect(child?.classList.contains('plan-step--depth-1')).toBe(true);
  });

  it('handles null plan (nothing rendered)', async () => {
    el = await createViewer({ plan: null });
    expect(el.querySelector('.plan-block')).toBeNull();
  });
});
