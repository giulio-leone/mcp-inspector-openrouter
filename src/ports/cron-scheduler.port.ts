/**
 * ICronSchedulerPort — contract for cron-like scheduled task management.
 * Uses Chrome Alarms API for timing and delegates execution to IBackgroundTaskPort.
 */

/** Schedule definition */
export interface CronSchedule {
  readonly id: string;
  readonly description: string;
  /** Interval in minutes (minimum 1 for Chrome Alarms API) */
  readonly intervalMinutes: number;
  /** Whether this is a one-shot delay or recurring */
  readonly recurring: boolean;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly lastRunAt?: number;
  readonly nextRunAt?: number;
}

/** Options for creating a schedule */
export interface ScheduleOptions {
  readonly description: string;
  readonly intervalMinutes: number;
  readonly recurring?: boolean;
  readonly execute: () => Promise<unknown>;
}

/** Event map for CronScheduler */
export interface CronEventMap {
  'schedule:created': { readonly scheduleId: string; readonly description: string };
  'schedule:triggered': { readonly scheduleId: string };
  'schedule:cancelled': { readonly scheduleId: string };
  'schedule:error': { readonly scheduleId: string; readonly error: string };
}

/** Port interface for cron scheduling */
export interface ICronSchedulerPort {
  schedule(options: ScheduleOptions): string;
  cancel(scheduleId: string): boolean;
  getSchedule(scheduleId: string): CronSchedule | undefined;
  listSchedules(): readonly CronSchedule[];
  dispose(): void;
}
