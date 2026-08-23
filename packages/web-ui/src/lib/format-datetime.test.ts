import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { updatedAgo } from './format-datetime';

// Fixed "now" so the relative maths is deterministic.
const NOW = new Date('2026-08-23T12:00:00Z');

describe('updatedAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads "just now" under a minute', () => {
    expect(updatedAgo('2026-08-23T11:59:30Z')).toBe('just now');
  });

  it('counts minutes and hours in full words, singular and plural', () => {
    expect(updatedAgo('2026-08-23T11:59:00Z')).toBe('1 minute ago');
    expect(updatedAgo('2026-08-23T11:15:00Z')).toBe('45 minutes ago');
    expect(updatedAgo('2026-08-23T11:00:00Z')).toBe('1 hour ago');
    expect(updatedAgo('2026-08-23T04:00:00Z')).toBe('8 hours ago');
  });

  it('counts days up to the 5-day threshold', () => {
    expect(updatedAgo('2026-08-22T11:00:00Z')).toBe('1 day ago');
    expect(updatedAgo('2026-08-19T12:00:01Z')).toBe('3 days ago');
  });

  it('switches to the plain date at 5 days and beyond', () => {
    expect(updatedAgo('2026-08-18T12:00:00Z')).toBe('18/08/2026');
    expect(updatedAgo('2026-05-19T10:38:41Z')).toBe('19/05/2026');
  });

  it('answers "never" for missing or unparseable values', () => {
    expect(updatedAgo(null)).toBe('never');
    expect(updatedAgo(undefined)).toBe('never');
    expect(updatedAgo('not a date')).toBe('never');
  });

  it('treats a clock-skewed future stamp as "just now"', () => {
    expect(updatedAgo('2026-08-23T12:00:05Z')).toBe('just now');
  });
});
