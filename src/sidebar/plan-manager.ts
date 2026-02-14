/**
 * plan-manager.ts — Manages plan state, step tracking, and plan tool handling.
 */

import type { Plan, PlanStep, ToolResponse } from '../types';
import type { PlanViewer } from '../components/plan-viewer';
import '../components/plan-viewer';


export interface ActivePlan {
  plan: Plan;
  element: PlanViewer;
  currentStepIdx: number;
}

export class PlanManager {
  activePlan: ActivePlan | null = null;
  planModeEnabled = false;

  private _batchStepIdx: number | null = null;

  constructor(
    private readonly chatContainer: HTMLElement,
    initialPlanMode = false,
  ) {
    this.planModeEnabled = initialPlanMode;
  }

  // ── Step tracking (batch-aware) ──

  getCurrentPlanStep(): PlanStep | null {
    const ap = this.activePlan;
    if (!ap) return null;

    const { plan } = ap;
    if (this._batchStepIdx !== null) {
      return plan.steps[this._batchStepIdx] ?? null;
    }
    while (ap.currentStepIdx < plan.steps.length && plan.steps[ap.currentStepIdx].status === 'done') {
      ap.currentStepIdx++;
    }
    this._batchStepIdx = ap.currentStepIdx;
    return plan.steps[ap.currentStepIdx] ?? null;
  }

  advancePlanStep(): void {
    this._batchStepIdx = null;
  }

  markRemainingStepsDone(): void {
    const ap = this.activePlan;
    if (!ap) return;

    for (const step of ap.plan.steps) {
      if (step.status === 'pending' || step.status === 'in_progress') {
        step.status = 'done';
      }
      if (step.children) {
        for (const child of step.children) {
          if (child.status === 'pending' || child.status === 'in_progress') {
            child.status = 'done';
          }
        }
      }
    }
    ap.element.plan = { ...ap.plan };
  }

  // ── Plan tool handling ──

  handlePlanTool(
    name: string,
    args: Record<string, unknown>,
    id: string,
  ): ToolResponse {
    console.debug(`[Sidebar] Processing ${name} tool call`, args);
    const planArgs = args as {
      goal: string;
      steps: Array<{ id: string; title: string; children?: Array<{ id: string; title: string }> }>;
    };
    const plan: Plan = {
      goal: planArgs.goal,
      steps: (planArgs.steps ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        status: 'pending' as const,
        children: s.children?.map((c) => ({
          id: c.id,
          title: c.title,
          status: 'pending' as const,
        })),
      })),
      createdAt: Date.now(),
      status: 'pending',
    };

    if (this.activePlan && name === 'update_plan') {
      this.activePlan.plan = plan;
      this.activePlan.currentStepIdx = 0;
      this.activePlan.element.plan = plan;
    } else {
      const planEl = document.createElement('plan-viewer') as PlanViewer;
      planEl.plan = plan;
      this.activePlan = { plan, element: planEl, currentStepIdx: 0 };
      console.debug('[Sidebar] chatContainer exists:', !!this.chatContainer);
      if (this.chatContainer) {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg msg-plan';
        wrapper.appendChild(planEl);
        this.chatContainer.appendChild(wrapper);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        console.debug('[Sidebar] Plan rendered into chatContainer');
      }
    }

    return {
      functionResponse: {
        name,
        response: { result: `Plan "${plan.goal}" created with ${plan.steps.length} steps. Now execute it.` },
        tool_call_id: id,
      },
    };
  }

  /** Mark a step as in-progress in the plan UI. */
  markStepInProgress(): void {
    if (!this.activePlan) return;
    const step = this.getCurrentPlanStep();
    if (step) {
      step.status = 'in_progress';
      this.activePlan.element.updateStep(step.id, 'in_progress');
    }
  }

  /** Mark the current step as done with optional detail. */
  markStepDone(detail?: string): void {
    if (!this.activePlan) return;
    const step = this.getCurrentPlanStep();
    if (step) {
      step.status = 'done';
      this.activePlan.element.updateStep(step.id, 'done', detail);
    }
  }

  /** Mark the current step as failed with optional detail. */
  markStepFailed(detail?: string): void {
    if (!this.activePlan) return;
    const step = this.getCurrentPlanStep();
    if (step) {
      step.status = 'failed';
      this.activePlan.element.updateStep(step.id, 'failed', detail);
    }
  }
}
