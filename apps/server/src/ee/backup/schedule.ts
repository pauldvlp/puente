import type { BackupFrequency } from '@puente/shared';

export interface ScheduleShape {
  frequency: BackupFrequency;
  /** Local hour, 0–23. */
  hour: number;
  /** 0 = Sunday. Only meaningful for `weekly`. */
  weekday: number;
}

/**
 * When the next backup is due, in local time.
 *
 * Pure and clock-injected, because every interesting case is a date boundary: the hour that has
 * already passed today, the weekly run whose day is today but whose hour is not, and the one whose
 * day is behind us and has to wrap into next week. Those are miserable to test against a real
 * clock and trivial against this.
 */
export function nextRunAfter(schedule: ScheduleShape, from: Date): Date {
  const next = new Date(from);
  next.setHours(schedule.hour, 0, 0, 0);

  if (schedule.frequency === 'daily') {
    // Strictly after `from`: a run that just happened must not be scheduled again this second.
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  const daysAhead = (schedule.weekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysAhead);
  if (next <= from) next.setDate(next.getDate() + 7);
  return next;
}

/**
 * Which files to delete so that `keep` remain, newest first.
 *
 * Returns names rather than deleting, so the caller can prune *after* a successful backup —
 * deleting first and failing second is how someone ends up with fewer backups than they had.
 */
export function filesToPrune<T extends { name: string; createdAt: number }>(
  files: T[],
  keep: number,
): T[] {
  return [...files].sort((a, b) => b.createdAt - a.createdAt).slice(keep);
}
