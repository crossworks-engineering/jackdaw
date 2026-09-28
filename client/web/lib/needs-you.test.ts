import { describe, expect, it } from 'vitest';
import {
  arrivalText,
  arrivals,
  needsYouHref,
  needsYouLabel,
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

const ny = (over: {
  submitted?: number;
  leftBehind?: number;
  review?: ReturnType<typeof item> | null;
  open?: number;
  request?: ReturnType<typeof item> | null;
}): NeedsYou => {
  const submitted = over.submitted ?? 0;
  const leftBehind = over.leftBehind ?? 0;
  const open = over.open ?? 0;
  return {
    review: { submitted, leftBehind, newest: over.review ?? null },
    requests: { open, newest: over.request ?? null },
    total: submitted + leftBehind + open,
  };
};

describe('needs-you counts and words', () => {
  it('labels review and requests, and nothing when nothing waits', () => {
    expect(needsYouLabel(ny({ submitted: 2 }))).toBe('2 waiting for review');
    expect(needsYouLabel(ny({ submitted: 2, leftBehind: 1, open: 1 }))).toBe(
      '2 waiting for review · 1 open request',
    );
    // Left behind is not urgent: it alone lights nothing.
    expect(needsYouLabel(ny({ leftBehind: 4 }))).toBeNull();
    expect(needsYouLabel(ny({ open: 3 }))).toBe('3 open requests');
    expect(needsYouLabel(ny({}))).toBeNull();
    expect(needsYouLabel(null)).toBeNull();
    expect(totalWaiting(ny({ submitted: 1, leftBehind: 2, open: 3 }))).toBe(4);
  });

  it('goes to Review first, to Requests when only requests wait', () => {
    expect(needsYouHref(ny({ submitted: 1, open: 1 }))).toBe('/team-admin?view=review');
    expect(needsYouHref(ny({ open: 1 }))).toBe('/team-admin?view=requests');
  });

  it('puts the count in front of the title once, and takes it away', () => {
    expect(titleWithCount('Jackdaw', 2)).toBe('(2) Jackdaw');
    expect(titleWithCount('(2) Jackdaw', 3)).toBe('(3) Jackdaw');
    expect(titleWithCount('(3) Jackdaw', 0)).toBe('Jackdaw');
    expect(titleWithCount('Pages · Jackdaw', 150)).toBe('(99+) Pages · Jackdaw');
    expect(titleWithCount('(99+) Jackdaw', 1)).toBe('(1) Jackdaw');
  });

  it('names the title and the member, never more, and links the item', () => {
    const a = { kind: 'review' as const, item: item('id 1', '2026-09-28T10:00:00Z') };
    expect(arrivalText(a)).toEqual({
      title: 'Waiting for your review',
      body: 'Mia sent "Pump spec" for review',
      href: '/team-admin?view=review&item=id%201',
    });
    const r = { kind: 'request' as const, item: item('t', '2026-09-28T10:00:00Z', ' ', 'Pat') };
    expect(arrivalText(r)).toEqual({
      title: 'New team request',
      body: 'Pat: "Untitled"',
      href: '/team-admin?view=requests',
    });
  });
});

describe('arrivals', () => {
  const t0 = '2026-09-28T10:00:00Z';
  const t1 = '2026-09-28T10:05:00Z';
  const t2 = '2026-09-28T10:06:00Z';

  it('the first load announces nothing', () => {
    expect(arrivals(null, ny({ submitted: 1, review: item('a', t0) }))).toEqual([]);
  });

  it('a new newest item arrives; the same one does not again', () => {
    const before = ny({ submitted: 1, review: item('a', t0) });
    const after = ny({ submitted: 2, review: item('b', t1) });
    expect(arrivals(before, after)).toEqual([{ kind: 'review', item: item('b', t1) }]);
    expect(arrivals(after, after)).toEqual([]);
  });

  it('a queue that shrank announces nothing', () => {
    const before = ny({ submitted: 2, review: item('b', t1) });
    expect(arrivals(before, ny({ submitted: 1, review: item('a', t0) }))).toEqual([]);
    expect(arrivals(before, ny({}))).toEqual([]);
  });

  it('a recalled and resubmitted item arrives again', () => {
    const before = ny({ submitted: 1, review: item('a', t0) });
    expect(arrivals(before, ny({ submitted: 1, review: item('a', t1) }))).toHaveLength(1);
  });

  it('both queues at once, newest first', () => {
    const before = ny({});
    const after = ny({ submitted: 1, review: item('a', t1), open: 1, request: item('r', t2) });
    expect(arrivals(before, after).map((a) => a.kind)).toEqual(['request', 'review']);
  });
});
