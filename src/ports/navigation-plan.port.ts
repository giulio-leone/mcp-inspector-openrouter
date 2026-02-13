/**
 * INavigationPlanPort — contract for step-based declarative workflow planning.
 * Manages navigation plan state and step progression for multi-tab workflows.
 */

// ── Step Types ──

/** Step types as discriminated union */
export type NavigationStepType = 'open-tab' | 'navigate' | 'extract' | 'fill' | 'wait' | 'close-tab';

/** Error handling strategy per step */
export type StepErrorStrategy = 'retry' | 'skip' | 'abort';

/** Precondition for a step */
export interface StepPrecondition {
  readonly type: 'tab-exists' | 'element-visible' | 'data-available';
  readonly target: string;
}

/** Base step with common fields */
export interface NavigationStepBase {
  readonly id: string;
  readonly type: NavigationStepType;
  readonly description: string;
  readonly preconditions: readonly StepPrecondition[];
  readonly onError: StepErrorStrategy;
  readonly maxRetries: number;
}

// ── Step Variants ──

export interface OpenTabStep extends NavigationStepBase {
  readonly type: 'open-tab';
  readonly url: string;
}

export interface NavigateStep extends NavigationStepBase {
  readonly type: 'navigate';
  readonly tabId: number;
  readonly url: string;
}

export interface ExtractStep extends NavigationStepBase {
  readonly type: 'extract';
  readonly tabId: number;
  readonly selector: string;
  readonly dataKey: string;
}

export interface FillStep extends NavigationStepBase {
  readonly type: 'fill';
  readonly tabId: number;
  readonly selector: string;
  readonly value: string;
}

export interface WaitStep extends NavigationStepBase {
  readonly type: 'wait';
  readonly tabId: number;
  readonly condition: 'page-load' | 'element-visible' | 'delay';
  readonly target: string;
}

export interface CloseTabStep extends NavigationStepBase {
  readonly type: 'close-tab';
  readonly tabId: number;
}

export type NavigationStep =
  | OpenTabStep
  | NavigateStep
  | ExtractStep
  | FillStep
  | WaitStep
  | CloseTabStep;

// ── Execution Types ──

/** Step execution result status */
export type StepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

/** Result of executing a single step */
export interface StepResult {
  readonly stepId: string;
  readonly status: StepStatus;
  readonly data?: unknown;
  readonly error?: string;
  readonly retryCount: number;
}

/** Navigation plan definition */
export interface NavigationPlan {
  readonly id: string;
  readonly description: string;
  readonly steps: readonly NavigationStep[];
}

/** Plan execution state */
export interface PlanExecutionState {
  readonly planId: string;
  readonly currentStepIndex: number;
  readonly results: readonly StepResult[];
  readonly status: 'idle' | 'running' | 'completed' | 'failed' | 'aborted';
}

// ── Port Interface ──

export interface INavigationPlanPort {
  createPlan(description: string, steps: readonly NavigationStep[]): NavigationPlan;
  getState(): PlanExecutionState | null;
  getCurrentStep(): NavigationStep | null;
  advanceStep(result: StepResult): void;
  abort(reason: string): void;
  reset(): void;
}
