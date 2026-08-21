import { describe, it, expect } from 'vitest';
import { filesToPrune, nextRunAfter } from './schedule';

/** Local time throughout: the panel schedules on the operator's clock, not UTC. */
const at = (iso: string): Date => new Date(iso);
const hhmm = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;

describe('nextRunAfter — daily', () => {
  const daily = { frequency: 'daily' as const, hour: 3, weekday: 0 };

  it('is later today when the hour has not passed', () => {
    expect(hhmm(nextRunAfter(daily, at('2026-08-21T01:30:00')))).toBe('2026-08-21 03:00');
  });

  it('rolls to tomorrow once the hour has passed', () => {
    expect(hhmm(nextRunAfter(daily, at('2026-08-21T09:00:00')))).toBe('2026-08-22 03:00');
  });

  it('does not schedule the same second twice', () => {
    // Called right after a run completes, the answer must be tomorrow, not now.
    expect(hhmm(nextRunAfter(daily, at('2026-08-21T03:00:00')))).toBe('2026-08-22 03:00');
  });

  it('crosses a month boundary', () => {
    expect(hhmm(nextRunAfter(daily, at('2026-08-31T23:00:00')))).toBe('2026-09-01 03:00');
  });
});

describe('nextRunAfter — weekly', () => {
  // Sunday = 0; this asks for Wednesday at 04:00.
  const weekly = { frequency: 'weekly' as const, hour: 4, weekday: 3 };

  it('finds the next Wednesday from a Monday', () => {
    expect(hhmm(nextRunAfter(weekly, at('2026-08-17T10:00:00')))).toBe('2026-08-19 04:00');
  });

  it('is today when it is Wednesday and the hour is still ahead', () => {
    expect(hhmm(nextRunAfter(weekly, at('2026-08-19T01:00:00')))).toBe('2026-08-19 04:00');
  });

  it('wraps a whole week when Wednesday is already behind us', () => {
    expect(hhmm(nextRunAfter(weekly, at('2026-08-19T05:00:00')))).toBe('2026-08-26 04:00');
  });

  it('handles the day being earlier in the week than today', () => {
    // Friday, asking for Wednesday: next week.
    expect(hhmm(nextRunAfter(weekly, at('2026-08-21T12:00:00')))).toBe('2026-08-26 04:00');
  });
});

describe('filesToPrune', () => {
  const file = (name: string, createdAt: number) => ({ name, createdAt });

  it('keeps the newest and returns the rest', () => {
    const files = [file('a', 1), file('b', 5), file('c', 3), file('d', 4)];
    expect(filesToPrune(files, 2).map((f) => f.name)).toEqual(['c', 'a']);
  });

  it('returns nothing when there is room to spare', () => {
    expect(filesToPrune([file('a', 1)], 7)).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    // The caller prunes after a successful backup; reordering their array under them would be rude.
    const files = [file('a', 1), file('b', 2)];
    filesToPrune(files, 1);
    expect(files.map((f) => f.name)).toEqual(['a', 'b']);
  });
});
