import { describe, expect, it } from 'vitest';
import {
  needsYouHref,
  needsYouLabel,
  requestsOpen,
  titleWithCount,
  totalWaiting,
  type NeedsYou,
} from './needs-you';

const item = (id: string, at: string, title = 'Pump spec', from = 'Mia') => ({
  id,
  title,
  from,
  at,
});

/** What a brain sends with work in the old review and requests queues. */
const busy = (): NeedsYou => ({
  review: { submitted: 2, leftBehind: 1, newest: item('a', '2026-09-28T10:00:00Z') },
  requests: { open: 3, newest: item('r', '2026-09-28T10:05:00Z') },
  total: 6,
});

describe('needs-you counts and words', () => {
  it('review and requests no longer count or show (W5c)', () => {
    expect(totalWaiting(busy())).toBe(0);
    expect(needsYouLabel(busy())).toBeNull();
    expect(needsYouLabel(null)).toBeNull();
    expect(totalWaiting(null)).toBe(0);
  });

  it('still reads open requests for Team admin until it goes', () => {
    expect(requestsOpen(busy())).toBe(3);
    expect(requestsOpen(null)).toBe(0);
  });

  it('puts the count in front of the title once, and takes it away', () => {
    expect(titleWithCount('Jackdaw', 2)).toBe('(2) Jackdaw');
    expect(titleWithCount('(2) Jackdaw', 3)).toBe('(3) Jackdaw');
    expect(titleWithCount('(3) Jackdaw', 0)).toBe('Jackdaw');
    expect(titleWithCount('Pages · Jackdaw', 150)).toBe('(99+) Pages · Jackdaw');
    expect(titleWithCount('(99+) Jackdaw', 1)).toBe('(1) Jackdaw');
  });
});

describe('needs-you: locked contact sharing (brain migration 0214)', () => {
  const withLocked = (base: NeedsYou, locked: number, id = 'c-1'): NeedsYou => ({
    ...base,
    sharing: { locked, newest: locked ? item(id, '2026-10-01T10:00:00Z', 'Ann', '') : null },
    total: base.total + locked,
  });

  it('counts and names a locked contact, and opens it', () => {
    const one = withLocked(busy(), 1);
    expect(totalWaiting(one)).toBe(1);
    expect(needsYouLabel(one)).toBe('1 contact locked');
    expect(needsYouHref(one)).toBe('/contacts?id=c-1');
    expect(needsYouLabel(withLocked(busy(), 2))).toBe('2 contacts locked');
  });

  it('a brain before 0214 sends no sharing: nothing shows', () => {
    expect(needsYouLabel(busy())).toBeNull();
    expect(needsYouHref(busy())).toBe('/contacts');
  });
});
