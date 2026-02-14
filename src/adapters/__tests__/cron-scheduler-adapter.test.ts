import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BackgroundTaskEventMap } from '../../ports/background-task.port';
import type { IBackgroundTaskPort } from '../../ports/background-task.port';
import { TypedEventBus } from '../event-bus';

// ── Chrome Alarms mock (not available in happy-dom) ──

const mockAlarmListeners: ((alarm: { name: string }) => void)[] = [];

const mockAlarms = {
  create: vi.fn(),
  clear: vi.fn().mockImplementation((_name: string, cb?: (wasCleared: boolean) => void) => {
    cb?.(true);
  }),
  onAlarm: {
    addListener: vi.fn().mockImplementation((listener: (alarm: { name: string }) => void) => {
      mockAlarmListeners.push(listener);
    }),
    removeListener: vi.fn(),
  },
};

vi.stubGlobal('chrome', { alarms: mockAlarms });

import { CronSchedulerAdapter } from '../cron-scheduler-adapter';

const mockBackgroundTask: IBackgroundTaskPort = {
  enqueue: vi.fn().mockReturnValue('task-123'),
  cancel: vi.fn().mockReturnValue(true),
  getTask: vi.fn(),
  listTasks: vi.fn().mockReturnValue([]),
  dispose: vi.fn(),
};

// Attach a real eventBus for type compatibility (adapters read it)
(mockBackgroundTask as Record<string, unknown>).eventBus =
  new TypedEventBus<BackgroundTaskEventMap>();

describe('CronSchedulerAdapter', () => {
  let adapter: CronSchedulerAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAlarmListeners.length = 0;
    adapter = new CronSchedulerAdapter(mockBackgroundTask);
  });

  afterEach(() => {
    adapter.dispose();
  });

  // ── schedule ──

  it('schedule creates a CronSchedule and returns id', () => {
    const id = adapter.schedule({
      description: 'sync',
      intervalMinutes: 5,
      execute: () => Promise.resolve(),
    });

    expect(id).toBeDefined();
    const s = adapter.getSchedule(id);
    expect(s).toBeDefined();
    expect(s!.description).toBe('sync');
    expect(s!.intervalMinutes).toBe(5);
    expect(s!.recurring).toBe(true);
    expect(s!.enabled).toBe(true);
  });

  it('schedule calls chrome.alarms.create with periodInMinutes for recurring', () => {
    const id = adapter.schedule({
      description: 'rec',
      intervalMinutes: 10,
      recurring: true,
      execute: () => Promise.resolve(),
    });

    expect(mockAlarms.create).toHaveBeenCalledWith(id, { periodInMinutes: 10 });
  });

  it('schedule calls chrome.alarms.create with delayInMinutes for one-shot', () => {
    const id = adapter.schedule({
      description: 'once',
      intervalMinutes: 3,
      recurring: false,
      execute: () => Promise.resolve(),
    });

    expect(mockAlarms.create).toHaveBeenCalledWith(id, { delayInMinutes: 3 });
  });

  // ── cancel ──

  it('cancel clears the alarm and removes schedule', () => {
    const id = adapter.schedule({
      description: 'cancel-me',
      intervalMinutes: 1,
      execute: () => Promise.resolve(),
    });

    const result = adapter.cancel(id);

    expect(result).toBe(true);
    expect(mockAlarms.clear).toHaveBeenCalledWith(id);
    expect(adapter.getSchedule(id)).toBeUndefined();
  });

  it('cancel returns false for unknown scheduleId', () => {
    expect(adapter.cancel('nonexistent')).toBe(false);
  });

  it('schedule throws when intervalMinutes < 1', () => {
    expect(() => adapter.schedule({
      description: 'bad',
      intervalMinutes: 0.5,
      execute: () => Promise.resolve(),
    })).toThrow('intervalMinutes must be >= 1');
  });

  // ── alarm trigger ──

  it('alarm trigger enqueues task via backgroundTaskPort', () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const id = adapter.schedule({
      description: 'enqueue-test',
      intervalMinutes: 1,
      execute,
    });

    mockAlarmListeners[0]({ name: id });

    expect(mockBackgroundTask.enqueue).toHaveBeenCalledWith({
      description: 'cron:enqueue-test',
      execute,
    });
  });

  it('alarm trigger updates lastRunAt', () => {
    const id = adapter.schedule({
      description: 'run',
      intervalMinutes: 2,
      execute: () => Promise.resolve(),
    });

    expect(adapter.getSchedule(id)!.lastRunAt).toBeUndefined();

    mockAlarmListeners[0]({ name: id });

    expect(adapter.getSchedule(id)!.lastRunAt).toBeGreaterThan(0);
  });

  it('one-shot alarm removes schedule after trigger', () => {
    const id = adapter.schedule({
      description: 'one-shot',
      intervalMinutes: 1,
      recurring: false,
      execute: () => Promise.resolve(),
    });

    mockAlarmListeners[0]({ name: id });

    expect(adapter.getSchedule(id)).toBeUndefined();
  });

  it('recurring alarm keeps schedule enabled after trigger', () => {
    const id = adapter.schedule({
      description: 'recurring',
      intervalMinutes: 5,
      recurring: true,
      execute: () => Promise.resolve(),
    });

    mockAlarmListeners[0]({ name: id });

    expect(adapter.getSchedule(id)!.enabled).toBe(true);
  });

  // ── eventBus ──

  it('eventBus emits schedule:created', () => {
    const events: string[] = [];
    adapter.eventBus.on('schedule:created', ({ scheduleId }) => events.push(scheduleId));

    const id = adapter.schedule({
      description: 'evt',
      intervalMinutes: 1,
      execute: () => Promise.resolve(),
    });

    expect(events).toEqual([id]);
  });

  it('eventBus emits schedule:triggered on alarm', () => {
    const triggered: string[] = [];
    adapter.eventBus.on('schedule:triggered', ({ scheduleId }) => triggered.push(scheduleId));

    const id = adapter.schedule({
      description: 'trig',
      intervalMinutes: 1,
      execute: () => Promise.resolve(),
    });
    mockAlarmListeners[0]({ name: id });

    expect(triggered).toEqual([id]);
  });

  it('eventBus emits schedule:cancelled on cancel', () => {
    const cancelled: string[] = [];
    adapter.eventBus.on('schedule:cancelled', ({ scheduleId }) => cancelled.push(scheduleId));

    const id = adapter.schedule({
      description: 'c',
      intervalMinutes: 1,
      execute: () => Promise.resolve(),
    });
    adapter.cancel(id);

    expect(cancelled).toEqual([id]);
  });

  // ── dispose ──

  it('dispose cancels all enabled schedules', () => {
    const id1 = adapter.schedule({
      description: 'a',
      intervalMinutes: 1,
      execute: () => Promise.resolve(),
    });
    const id2 = adapter.schedule({
      description: 'b',
      intervalMinutes: 2,
      execute: () => Promise.resolve(),
    });

    adapter.dispose();

    // clear called for each enabled schedule (plus any from cancel)
    const clearCalls = mockAlarms.clear.mock.calls.map((c: unknown[]) => c[0]);
    expect(clearCalls).toContain(id1);
    expect(clearCalls).toContain(id2);
    expect(adapter.listSchedules()).toHaveLength(0);
  });
});
