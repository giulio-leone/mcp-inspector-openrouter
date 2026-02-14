/**
 * <plan-viewer> — Renders an AI execution plan with reactive step updates.
 * Uses Light DOM so existing plan.css styles apply.
 */
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from './base-element';
import { ICONS } from '../sidebar/icons';
import type { Plan, PlanStep, PlanStepStatus } from '../types';

const STATUS_ICONS: Record<string, string> = {
  pending: ICONS.square,
  in_progress: ICONS.refresh,
  done: ICONS.checkCircle,
  failed: ICONS.xCircle,
  skipped: ICONS.skipForward,
};

export class PlanViewer extends BaseElement {
  static properties = {
    plan: { type: Object },
    collapsed: { type: Boolean },
  };

  declare plan: Plan | null;
  declare collapsed: boolean;

  constructor() {
    super();
    this.plan = null;
    this.collapsed = false;
  }

  override createRenderRoot(): this {
    return this;
  }

  /** Update a step's status/detail and trigger re-render with auto-computed overall status. */
  updateStep(stepId: string, status: PlanStepStatus, detail?: string): void {
    if (!this.plan) return;

    const found = this._findStep(this.plan.steps, stepId);
    if (!found) return;

    found.status = status;
    if (detail !== undefined) found.detail = detail;

    this.plan = { ...this.plan, status: this._computeOverallStatus(this.plan.steps) };
  }

  private _findStep(steps: PlanStep[], id: string): PlanStep | null {
    for (const step of steps) {
      if (step.id === id) return step;
      if (step.children) {
        const child = this._findStep(step.children, id);
        if (child) return child;
      }
    }
    return null;
  }

  private _computeOverallStatus(steps: PlanStep[]): PlanStepStatus {
    const all = this._collectStatuses(steps);
    if (all.every(s => s === 'done')) return 'done';
    if (all.some(s => s === 'in_progress')) return 'in_progress';
    if (all.some(s => s === 'failed')) return 'failed';
    if (all.some(s => s === 'done')) return 'in_progress';
    return 'pending';
  }

  private _collectStatuses(steps: PlanStep[]): PlanStepStatus[] {
    const result: PlanStepStatus[] = [];
    for (const step of steps) {
      result.push(step.status);
      if (step.children) result.push(...this._collectStatuses(step.children));
    }
    return result;
  }

  private _toggleCollapse(): void {
    this.collapsed = !this.collapsed;
  }

  private _renderStep(step: PlanStep, depth: number): unknown {
    const depthClass = `plan-step--depth-${Math.min(depth, 3)}`;
    return html`<div class="plan-step plan-step--${step.status} ${depthClass}" data-step-id=${step.id}><div class="plan-step-row"><span class="plan-step-icon">${unsafeHTML(STATUS_ICONS[step.status] ?? ICONS.square)}</span><span class="plan-step-title">${step.id}. ${step.title}</span>${step.detail ? html`<span class="plan-step-detail">${step.detail}</span>` : nothing}</div>${step.children?.length ? html`<div class="plan-step-children">${step.children.map(c => this._renderStep(c, depth + 1))}</div>` : nothing}</div>`;
  }

  protected override render(): unknown {
    if (!this.plan) return nothing;

    const p = this.plan;
    return html`<div class="plan-block${this.collapsed ? ' plan-block--collapsed' : ''}" data-plan-goal=${p.goal}><div class="plan-header"><span class="plan-icon">${unsafeHTML(ICONS.clipboard)}</span><span class="plan-goal">${p.goal}</span><span class="plan-status-badge plan-status--${p.status}">${unsafeHTML(STATUS_ICONS[p.status] ?? ICONS.square)}</span><button class="plan-toggle-btn" title="Espandi/Comprimi" @click=${this._toggleCollapse}>${unsafeHTML(this.collapsed ? ICONS.chevronRight : ICONS.chevronDown)}</button></div><div class="plan-steps">${p.steps.map(s => this._renderStep(s, 0))}</div></div>`;
  }
}

customElements.define('plan-viewer', PlanViewer);
