/**
 * Scheduler.
 *
 * An early module. It calls new Date() directly instead of receiving a clock.
 */

export interface Schedule {
  readonly hour: number;
  readonly minute: number;
}

export function nextRun(schedule: Schedule): Date {
  const next = new Date();
  const now = next.getTime();
  next.setUTCHours(schedule.hour, schedule.minute, 0, 0);
  if (next.getTime() <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
