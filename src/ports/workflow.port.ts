/**
 * IWorkflowPort — contract for browser-safe workflow execution.
 *
 * Mirrors the OneCrawl WorkflowPort with an event listener hook
 * so the Chrome extension can observe step progress in real time.
 */

export interface WorkflowStepDef {
  readonly id: string;
  readonly name: string;
  readonly execute: (ctx: WorkflowContextMap) => Promise<WorkflowContextMap>;
}

export type WorkflowContextMap = Record<string, unknown>;

export interface WorkflowDef {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly WorkflowStepDef[];
  readonly initialContext?: WorkflowContextMap;
  readonly maxDurationMs?: number;
}

export interface WorkflowRunResult {
  readonly status: 'completed' | 'failed';
  readonly context: WorkflowContextMap;
  readonly completedSteps: readonly string[];
  readonly failedStep?: string;
  readonly error?: string;
  readonly totalDurationMs: number;
}

export type WorkflowEventType = 'step:start' | 'step:complete' | 'step:error';

export interface WorkflowRunEvent {
  readonly type: WorkflowEventType;
  readonly stepId: string;
  readonly stepName: string;
  readonly timestamp: number;
  readonly context?: WorkflowContextMap;
  readonly error?: string;
}

export type WorkflowEventCallback = (event: WorkflowRunEvent) => void;

export interface IWorkflowPort {
  /** Execute a workflow definition, optionally with initial context. */
  execute(
    definition: WorkflowDef,
    context?: WorkflowContextMap,
  ): Promise<WorkflowRunResult>;

  /** Register a listener for workflow events (step start/complete/error). */
  onEvent(listener: WorkflowEventCallback): () => void;
}
