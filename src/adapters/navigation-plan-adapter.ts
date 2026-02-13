/**
 * NavigationPlanAdapter — manages navigation plan state and step progression.
 * Handles plan creation, step advancement with retry/skip/abort strategies,
 * and template resolution for data interpolation between steps.
 */

import type {
  INavigationPlanPort,
  NavigationPlan,
  NavigationStep,
  PlanExecutionState,
  StepResult,
} from '../ports/navigation-plan.port';

/** Replaces ${dataKey} placeholders with data from previous step results */
export function resolveTemplate(value: string, results: readonly StepResult[]): string {
  return value.replace(/\$\{(\w+)\}/g, (match, key: string) => {
    for (const result of results) {
      if (
        result.status === 'completed' &&
        result.data != null &&
        typeof result.data === 'object' &&
        key in (result.data as Record<string, unknown>)
      ) {
        return String((result.data as Record<string, unknown>)[key]);
      }
    }
    return match;
  });
}

export class NavigationPlanAdapter implements INavigationPlanPort {
  private plan: NavigationPlan | null = null;
  private state: PlanExecutionState | null = null;

  createPlan(description: string, steps: readonly NavigationStep[]): NavigationPlan {
    this.plan = {
      id: crypto.randomUUID(),
      description,
      steps,
    };
    this.state = {
      planId: this.plan.id,
      currentStepIndex: 0,
      results: [],
      status: steps.length === 0 ? 'completed' : 'running',
    };
    return this.plan;
  }

  getState(): PlanExecutionState | null {
    return this.state;
  }

  getCurrentStep(): NavigationStep | null {
    if (!this.plan || !this.state) return null;
    if (this.state.currentStepIndex >= this.plan.steps.length) return null;
    if (this.state.status !== 'running') return null;
    return this.plan.steps[this.state.currentStepIndex];
  }

  advanceStep(result: StepResult): void {
    if (!this.plan || !this.state || this.state.status !== 'running') return;

    const currentStep = this.plan.steps[this.state.currentStepIndex];
    if (!currentStep) return;

    if (result.stepId !== currentStep.id) return;

    if (result.status === 'failed') {
      switch (currentStep.onError) {
        case 'retry':
          if (result.retryCount < currentStep.maxRetries) {
            // Don't advance — allow retry
            this.state = { ...this.state, results: [...this.state.results, result] };
            return;
          }
          // Max retries exceeded — advance past the failed step
          break;
        case 'skip':
          break;
        case 'abort':
          this.state = {
            ...this.state,
            results: [...this.state.results, result],
            status: 'failed',
          };
          return;
      }
    }

    const nextIndex = this.state.currentStepIndex + 1;
    const isComplete = nextIndex >= this.plan.steps.length;

    this.state = {
      ...this.state,
      currentStepIndex: nextIndex,
      results: [...this.state.results, result],
      status: isComplete ? 'completed' : 'running',
    };
  }

  abort(_reason: string): void {
    if (!this.state) return;
    this.state = { ...this.state, status: 'aborted' };
  }

  reset(): void {
    this.plan = null;
    this.state = null;
  }
}
