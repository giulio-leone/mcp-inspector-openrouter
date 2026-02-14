/**
 * CronSchedulerAdapter — Implements ICronSchedulerPort using Chrome Alarms API.
 * Delegates task execution to IBackgroundTaskPort (Dependency Inversion).
 */

import { TypedEventBus } from './event-bus';
import type {
  ICronSchedulerPort,
  CronSchedule,
  CronEventMap,
  ScheduleOptions,
} from '../ports/cron-scheduler.port';
import type { IBackgroundTaskPort } from '../ports/background-task.port';

export class CronSchedulerAdapter implements ICronSchedulerPort {
  readonly eventBus = new TypedEventBus<CronEventMap>();
  private readonly schedules = new Map<string, CronSchedule>();
  private readonly callbacks = new Map<string, () => Promise<unknown>>();

  constructor(private readonly backgroundTask: IBackgroundTaskPort) {
    chrome.alarms.onAlarm.addListener(this.handleAlarm);
  }

  schedule(options: ScheduleOptions): string {
    if (options.intervalMinutes < 1) {
      throw new Error('intervalMinutes must be >= 1 (Chrome Alarms API minimum)');
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const recurring = options.recurring ?? true;
    const nextRunAt = now + options.intervalMinutes * 60_000;

    const cronSchedule: CronSchedule = {
      id,
      description: options.description,
      intervalMinutes: options.intervalMinutes,
      recurring,
      enabled: true,
      createdAt: now,
      nextRunAt,
    };

    this.schedules.set(id, cronSchedule);
    this.callbacks.set(id, options.execute);

    if (recurring) {
      chrome.alarms.create(id, { periodInMinutes: options.intervalMinutes });
    } else {
      chrome.alarms.create(id, { delayInMinutes: options.intervalMinutes });
    }

    this.eventBus.emit('schedule:created', { scheduleId: id, description: options.description });
    return id;
  }

  cancel(scheduleId: string): boolean {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled) return false;

    chrome.alarms.clear(scheduleId);
    this.schedules.delete(scheduleId);
    this.callbacks.delete(scheduleId);
    this.eventBus.emit('schedule:cancelled', { scheduleId });
    return true;
  }

  getSchedule(scheduleId: string): CronSchedule | undefined {
    return this.schedules.get(scheduleId);
  }

  listSchedules(): readonly CronSchedule[] {
    return Object.freeze([...this.schedules.values()]);
  }

  dispose(): void {
    chrome.alarms.onAlarm.removeListener(this.handleAlarm);
    for (const [id, schedule] of this.schedules) {
      if (schedule.enabled) {
        chrome.alarms.clear(id);
      }
    }
    this.schedules.clear();
    this.callbacks.clear();
    this.eventBus.dispose();
  }

  private readonly handleAlarm = (alarm: chrome.alarms.Alarm): void => {
    const schedule = this.schedules.get(alarm.name);
    if (!schedule || !schedule.enabled) return;

    // Capture callback before potential deletion
    const callback = this.callbacks.get(alarm.name);
    if (!callback) return;

    const now = Date.now();

    if (schedule.recurring) {
      this.schedules.set(alarm.name, {
        ...schedule,
        lastRunAt: now,
        nextRunAt: now + schedule.intervalMinutes * 60_000,
      });
    } else {
      // One-shot: clean up after trigger
      this.schedules.delete(alarm.name);
      this.callbacks.delete(alarm.name);
    }

    try {
      this.backgroundTask.enqueue({
        description: `cron:${schedule.description}`,
        execute: callback,
      });
      this.eventBus.emit('schedule:triggered', { scheduleId: alarm.name });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.eventBus.emit('schedule:error', { scheduleId: alarm.name, error });
    }
  };
}
