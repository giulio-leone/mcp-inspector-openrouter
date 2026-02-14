/**
 * plan-manager.ts — Manages plan state, step tracking, and plan tool handling.
 */

import type { Plan, PlanStep, ToolResponse } from '../types';
import { renderPlan, updatePlanStep } from './plan-renderer';
import { STORAGE_KEY_PLAN_MODE } from '../utils/constants';

export interface ActivePlan {
  plan: Plan;
  element: HTMLElement;
  currentStepIdx: number;
}

export class PlanManager {
  activePlan: ActivePlan | null = null;
  planModeEnabled = false;

  private _batchStepIdx: number | null = null;

  constructor(
    private readonly planToggle: HTMLButtonElement | null,
    private readonly chatContainer: HTMLElement,
  ) {
    this.initToggle();
  }

  // ── Initialisation ──

  private initToggle(): void {
    chrome.storage.local.get([STORAGE_KEY_PLAN_MODE]).then((result) => {
      this.planModeEnabled = result[STORAGE_KEY_PLAN_MODE] === true;
      this.updatePlanToggleUI();
    });

    if (this.planToggle) {
      this.planToggle.onclick = (): void => {
        this.planModeEnabled = !this.planModeEnabled;
        chrome.storage.local.set({ [STORAGE_KEY_PLAN_MODE]: this.planModeEnabled });
        this.updatePlanToggleUI();
      };
    }
  }

  private updatePlanToggleUI(): void {
    if (this.planToggle) {
      this.planToggle.classList.toggle('active', this.planModeEnabled);
    }
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
        updatePlanStep(ap.element, step.id, 'done');
      }
      if (step.children) {
        for (const child of step.children) {
          if (child.status === 'pending' || child.status === 'in_progress') {
            child.status = 'done';
            updatePlanStep(ap.element, child.id, 'done');
          }
        }
      }
    }
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
      const newPlanEl = renderPlan(plan);
      this.activePlan.element.replaceWith(newPlanEl);
      this.activePlan.element = newPlanEl;
    } else {
      const planEl = renderPlan(plan);
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
      updatePlanStep(this.activePlan.element, step.id, 'in_progress');
    }
  }

  /** Mark the current step as done with optional detail. */
  markStepDone(detail?: string): void {
    if (!this.activePlan) return;
    const step = this.getCurrentPlanStep();
    if (step) {
      step.status = 'done';
      updatePlanStep(this.activePlan.element, step.id, 'done', detail);
    }
  }

  /** Mark the current step as failed with optional detail. */
  markStepFailed(detail?: string): void {
    if (!this.activePlan) return;
    const step = this.getCurrentPlanStep();
    if (step) {
      step.status = 'failed';
      updatePlanStep(this.activePlan.element, step.id, 'failed', detail);
    }
  }
}
