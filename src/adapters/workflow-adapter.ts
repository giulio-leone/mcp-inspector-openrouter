/**
 * WorkflowAdapter — browser-safe adapter that executes workflow definitions
 * by walking their step list sequentially, emitting events, and honouring
 * the optional maxDurationMs timeout.
 *
 * Implements IWorkflowPort without pulling in any Node.js dependencies.
 */

import type {
  IWorkflowPort,
  WorkflowDef,
  WorkflowContextMap,
  WorkflowRunResult,
  WorkflowRunEvent,
  WorkflowEventCallback,
} from '../ports/workflow.port';

export class WorkflowAdapter implements IWorkflowPort {
  private readonly listeners = new Set<WorkflowEventCallback>();

  async execute(
    definition: WorkflowDef,
    context?: WorkflowContextMap,
  ): Promise<WorkflowRunResult> {
    const start = Date.now();
    let ctx: WorkflowContextMap = {
      ...definition.initialContext,
      ...context,
    };
    const completedSteps: string[] = [];

    for (const step of definition.steps) {
      // Check timeout before each step
      if (
        definition.maxDurationMs !== undefined &&
        Date.now() - start >= definition.maxDurationMs
      ) {
        return {
          status: 'failed',
          context: ctx,
          completedSteps,
          failedStep: step.id,
          error: `Workflow timed out after ${definition.maxDurationMs}ms`,
          totalDurationMs: Date.now() - start,
        };
      }

      this.emit({
        type: 'step:start',
        stepId: step.id,
        stepName: step.name,
        timestamp: Date.now(),
        context: ctx,
      });

      try {
        ctx = await step.execute(ctx);
        completedSteps.push(step.id);

        this.emit({
          type: 'step:complete',
          stepId: step.id,
          stepName: step.name,
          timestamp: Date.now(),
          context: ctx,
        });
      } catch (err) {
        const error =
          err instanceof Error ? err.message : String(err);

        this.emit({
          type: 'step:error',
          stepId: step.id,
          stepName: step.name,
          timestamp: Date.now(),
          error,
        });

        return {
          status: 'failed',
          context: ctx,
          completedSteps,
          failedStep: step.id,
          error,
          totalDurationMs: Date.now() - start,
        };
      }
    }

    return {
      status: 'completed',
      context: ctx,
      completedSteps,
      totalDurationMs: Date.now() - start,
    };
  }

  onEvent(listener: WorkflowEventCallback): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: WorkflowRunEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
