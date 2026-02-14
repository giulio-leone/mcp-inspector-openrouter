/**
 * BackgroundTaskAdapter — Implements IBackgroundTaskPort with TypedEventBus integration.
 * Tasks are enqueued and executed asynchronously with timeout support.
 */

import { TypedEventBus } from './event-bus';
import type {
  IBackgroundTaskPort,
  BackgroundTask,
  BackgroundTaskEventMap,
  EnqueueOptions,
} from '../ports/background-task.port';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT = 5;

export class BackgroundTaskAdapter implements IBackgroundTaskPort {
  readonly eventBus = new TypedEventBus<BackgroundTaskEventMap>();
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Reject handles to settle timeout promises eagerly on cancel/dispose */
  private readonly abortHandles = new Map<string, (reason: Error) => void>();

  enqueue(options: EnqueueOptions): string {
    const activeCount = [...this.tasks.values()].filter(
      (t) => t.status === 'running' || t.status === 'queued',
    ).length;
    if (activeCount >= MAX_CONCURRENT) {
      throw new Error(`Max concurrent tasks (${MAX_CONCURRENT}) reached`);
    }

    const id = crypto.randomUUID();
    const task: BackgroundTask = {
      id,
      description: options.description,
      status: 'queued',
      createdAt: Date.now(),
    };
    this.tasks.set(id, task);
    this.eventBus.emit('task:queued', { taskId: id, description: options.description });

    this.executeTask(id, options);

    return id;
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== 'queued' && task.status !== 'running')) {
      return false;
    }
    this.clearTimer(taskId);
    this.tasks.set(taskId, { ...task, status: 'cancelled', completedAt: Date.now() });
    this.eventBus.emit('task:cancelled', { taskId });
    return true;
  }

  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): readonly BackgroundTask[] {
    return Object.freeze([...this.tasks.values()]);
  }

  dispose(): void {
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'running' || task.status === 'queued') {
        this.clearTimer(taskId);
        this.tasks.set(taskId, { ...task, status: 'cancelled', completedAt: Date.now() });
      }
    }
    this.tasks.clear();
    this.timers.clear();
    this.abortHandles.clear();
    this.eventBus.dispose();
  }

  private clearTimer(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer != null) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
    const abort = this.abortHandles.get(taskId);
    if (abort) {
      abort(new Error('Task cancelled'));
      this.abortHandles.delete(taskId);
    }
  }

  private executeTask(taskId: string, options: EnqueueOptions): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    this.tasks.set(taskId, { ...task, status: 'running', startedAt: Date.now() });
    this.eventBus.emit('task:started', { taskId });

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutPromise = new Promise<never>((_, reject) => {
      this.abortHandles.set(taskId, reject);
      const timerId = setTimeout(() => reject(new Error('Task timed out')), timeoutMs);
      this.timers.set(taskId, timerId);
    });

    Promise.race([options.execute(), timeoutPromise]).then(
      (result) => {
        this.clearTimer(taskId);
        this.abortHandles.delete(taskId);
        const current = this.tasks.get(taskId);
        if (!current || current.status !== 'running') return;
        this.tasks.set(taskId, { ...current, status: 'completed', completedAt: Date.now(), result });
        this.eventBus.emit('task:completed', { taskId, result });
      },
      (err: unknown) => {
        this.clearTimer(taskId);
        this.abortHandles.delete(taskId);
        const current = this.tasks.get(taskId);
        if (!current || current.status !== 'running') return;
        const error = err instanceof Error ? err.message : String(err);
        this.tasks.set(taskId, { ...current, status: 'failed', completedAt: Date.now(), error });
        this.eventBus.emit('task:failed', { taskId, error });
      },
    );
  }
}
