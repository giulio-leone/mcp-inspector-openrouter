import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackgroundTaskAdapter } from '../background-task-adapter';

/** Flush microtask queue so fire-and-forget promises settle */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('BackgroundTaskAdapter', () => {
  let adapter: BackgroundTaskAdapter;

  beforeEach(() => {
    adapter = new BackgroundTaskAdapter();
  });

  afterEach(() => {
    adapter.dispose();
  });

  // ── enqueue ──

  it('enqueue creates a queued task and returns taskId', () => {
    const id = adapter.enqueue({ description: 'test', execute: () => Promise.resolve() });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('task transitions to running then completed on success', async () => {
    let resolveTask!: (v: unknown) => void;
    const execute = () => new Promise<unknown>((r) => { resolveTask = r; });

    const id = adapter.enqueue({ description: 'ok', execute });
    await flush();
    expect(adapter.getTask(id)?.status).toBe('running');

    resolveTask('done');
    await flush();
    const task = adapter.getTask(id);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('done');
    expect(task?.completedAt).toBeGreaterThan(0);
  });

  it('task transitions to running then failed on error', async () => {
    let rejectTask!: (e: Error) => void;
    const execute = () => new Promise<unknown>((_, rej) => { rejectTask = rej; });

    const id = adapter.enqueue({ description: 'fail', execute });
    await flush();
    expect(adapter.getTask(id)?.status).toBe('running');

    rejectTask(new Error('boom'));
    await flush();
    const task = adapter.getTask(id);
    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('boom');
  });

  it('task fails on timeout', async () => {
    vi.useFakeTimers();
    const execute = () => new Promise<unknown>(() => { /* never resolves */ });

    const id = adapter.enqueue({ description: 'timeout', execute, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(150);

    const task = adapter.getTask(id);
    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('Task timed out');
    vi.useRealTimers();
  });

  // ── cancel ──

  it('cancel running task returns true', async () => {
    const execute = () => new Promise<unknown>(() => {});
    const id = adapter.enqueue({ description: 'cancellable', execute });
    await flush();

    expect(adapter.cancel(id)).toBe(true);
    expect(adapter.getTask(id)?.status).toBe('cancelled');
  });

  it('cancel completed task returns false', async () => {
    const id = adapter.enqueue({ description: 'done', execute: () => Promise.resolve('r') });
    await flush();

    expect(adapter.cancel(id)).toBe(false);
  });

  // ── getTask ──

  it('getTask returns undefined for unknown taskId', () => {
    expect(adapter.getTask('nonexistent')).toBeUndefined();
  });

  // ── listTasks ──

  it('listTasks returns all tasks', async () => {
    adapter.enqueue({ description: 'a', execute: () => Promise.resolve() });
    adapter.enqueue({ description: 'b', execute: () => Promise.resolve() });
    const tasks = adapter.listTasks();
    expect(tasks).toHaveLength(2);
    expect(Object.isFrozen(tasks)).toBe(true);
  });

  // ── dispose ──

  it('dispose clears tasks and disposes event bus', () => {
    adapter.enqueue({ description: 'x', execute: () => Promise.resolve() });
    adapter.eventBus.on('task:queued', () => {});
    adapter.dispose();
    expect(adapter.listTasks()).toHaveLength(0);
    expect(adapter.eventBus.listenerCount()).toBe(0);
  });

  // ── eventBus integration ──

  it('eventBus emits task:queued, task:started, task:completed events', async () => {
    const events: string[] = [];
    adapter.eventBus.on('task:queued', () => events.push('queued'));
    adapter.eventBus.on('task:started', () => events.push('started'));
    adapter.eventBus.on('task:completed', () => events.push('completed'));

    adapter.enqueue({ description: 'events', execute: () => Promise.resolve('ok') });
    await flush();

    expect(events).toEqual(['queued', 'started', 'completed']);
  });

  it('eventBus emits task:failed event on error', async () => {
    const errors: string[] = [];
    adapter.eventBus.on('task:failed', ({ error }) => errors.push(error));

    adapter.enqueue({ description: 'err', execute: () => Promise.reject(new Error('fail')) });
    await flush();

    expect(errors).toEqual(['fail']);
  });

  it('eventBus emits task:cancelled event', async () => {
    let cancelled = false;
    adapter.eventBus.on('task:cancelled', () => { cancelled = true; });

    const id = adapter.enqueue({ description: 'c', execute: () => new Promise(() => {}) });
    await flush();
    adapter.cancel(id);

    expect(cancelled).toBe(true);
  });

  // ── maxConcurrent ──

  it('enqueue throws when maxConcurrent (5) reached', async () => {
    for (let i = 0; i < 5; i++) {
      adapter.enqueue({ description: `t${i}`, execute: () => new Promise(() => {}) });
    }
    await flush();

    expect(() =>
      adapter.enqueue({ description: 'over', execute: () => new Promise(() => {}) }),
    ).toThrow('Max concurrent tasks (5) reached');
  });
});
