/**
 * IBackgroundTaskPort — contract for background task lifecycle management.
 * Tracks asynchronous tasks with status transitions and event notifications.
 */

/** Status lifecycle of a background task */
export type BackgroundTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Definition of a background task */
export interface BackgroundTask {
  readonly id: string;
  readonly description: string;
  readonly status: BackgroundTaskStatus;
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly result?: unknown;
  readonly error?: string;
}

/** Options for enqueuing a task */
export interface EnqueueOptions {
  readonly description: string;
  readonly timeoutMs?: number;
  readonly execute: () => Promise<unknown>;
}

/** Event map for BackgroundTaskManager */
export interface BackgroundTaskEventMap {
  'task:queued': { readonly taskId: string; readonly description: string };
  'task:started': { readonly taskId: string };
  'task:completed': { readonly taskId: string; readonly result: unknown };
  'task:failed': { readonly taskId: string; readonly error: string };
  'task:cancelled': { readonly taskId: string };
}

/** Port interface for background task management */
export interface IBackgroundTaskPort {
  enqueue(options: EnqueueOptions): string;
  cancel(taskId: string): boolean;
  getTask(taskId: string): BackgroundTask | undefined;
  listTasks(): readonly BackgroundTask[];
  dispose(): void;
}
