import { describe, it, expect } from 'vitest';
import { absoluteTime, relativeTime } from './format';

const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);
const at = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime — the past', () => {
  it.each([
    [-2 * SECOND, 'just now'],
    [-30 * SECOND, '30s ago'],
    [-5 * MINUTE, '5m ago'],
    [-3 * HOUR, '3h ago'],
    [-4 * DAY, '4d ago'],
  ])('%i ms ago reads as %s', (offset, expected) => {
    expect(relativeTime(at(offset), NOW)).toBe(expected);
  });
});

describe('relativeTime — the future', () => {
  // The bug this covers: a scheduled backup five days out was announced as "just now",
  // because a negative difference fell through the first branch.
  it.each([
    [2 * SECOND, 'in a moment'],
    [30 * SECOND, 'in 30s'],
    [5 * MINUTE, 'in 5m'],
    [3 * HOUR, 'in 3h'],
    [5 * DAY, 'in 5d'],
  ])('%i ms ahead reads as %s', (offset, expected) => {
    expect(relativeTime(at(offset), NOW)).toBe(expected);
  });
});

describe('relativeTime — the edges', () => {
  it('falls back to a date once it is months away in either direction', () => {
    expect(relativeTime(at(400 * DAY), NOW)).toMatch(/\d/);
    expect(relativeTime(at(-400 * DAY), NOW)).toMatch(/\d/);
    expect(relativeTime(at(400 * DAY), NOW)).not.toContain('ago');
  });

  it('says nothing rather than something wrong for missing or broken input', () => {
    expect(relativeTime(null)).toBe('—');
    expect(relativeTime(undefined)).toBe('—');
    expect(relativeTime('not a date')).toBe('—');
    expect(absoluteTime(null)).toBe('—');
  });
});
