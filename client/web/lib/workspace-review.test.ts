import { describe, expect, it } from 'vitest';
import type { ReviewItemRow } from './member-review';
import {
  isLeftBehind,
  rejectConfirm,
  reviewInfoLine,
  reviewItemHref,
  reviewRowMeta,
  reviewRowsOf,
  reviewStateBadge,
  waitingByWorkspace,
} from './workspace-review';

const row = (over: Partial<ReviewItemRow> = {}): ReviewItemRow => ({
  id: 'i1',
  type: 'page',
  title: 'Pump spec',
  icon: null,
  sharing: 'private',
  reviewState: 'submitted',
  submittedAt: '2026-10-09T09:00:00.000Z',
  updatedAt: '2026-10-09T09:00:00.000Z',
  reason: 'submitted',
  author: { loginId: 'l1', name: 'Mia', email: null, inactive: false, role: 'member' },
  ...over,
});

describe('workspace review', () => {
  it('opens an item in its own workspace, Pages for a kind it does not know', () => {
    expect(reviewItemHref('page', 'a b')).toBe('/pages?review=a%20b');
    expect(reviewItemHref('note', 'x')).toBe('/notes?review=x');
    expect(reviewItemHref('table', 'x')).toBe('/tables?review=x');
    expect(reviewItemHref('draw', 'x')).toBe('/draw?review=x');
    expect(reviewItemHref('file', 'x')).toBe('/files?review=x');
    expect(reviewItemHref('app', 'x')).toBe('/pages?review=x');
    expect(reviewItemHref(null, 'x')).toBe('/pages?review=x');
  });

  it('each workspace lists only its own kind, in the queue order', () => {
    const items = [
      row({ id: 'p1' }),
      row({ id: 'n1', type: 'note' }),
      row({ id: 'p2', reason: 'left-behind' }),
    ];
    expect(reviewRowsOf(items, 'page').map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(reviewRowsOf(items, 'note').map((r) => r.id)).toEqual(['n1']);
    expect(reviewRowsOf(items, 'file')).toEqual([]);
    expect(reviewRowsOf(undefined, 'page')).toEqual([]);
  });

  it('links each workspace with something waiting, in the workspaces’ order', () => {
    const items = [row({ id: 'f', type: 'file' }), row({ id: 'p' }), row({ id: 'p2' })];
    expect(waitingByWorkspace(items)).toEqual([
      { kind: 'page', count: 2, label: '2 waiting in Pages', href: '/pages' },
      { kind: 'file', count: 1, label: '1 waiting in Files', href: '/files' },
    ]);
    expect(waitingByWorkspace([])).toEqual([]);
  });

  it('says what state it is in with one small badge, or none', () => {
    expect(reviewStateBadge(row())).toBeNull();
    expect(reviewStateBadge(row({ reviewState: 'taken' }))).toBe('Released');
    expect(reviewStateBadge(row({ reason: 'left-behind' }))).toBe('Left behind');
    expect(isLeftBehind(row({ reason: 'left-behind' }))).toBe(true);
  });

  it('words the card, the Info line and the Reject confirm without notes', () => {
    expect(reviewRowMeta(row(), 'Oct 9')).toBe('Mia · sent Oct 9');
    expect(reviewRowMeta(row({ reason: 'left-behind' }), 'Oct 9')).toBe(
      'Mia (inactive) · shared Oct 9',
    );
    expect(reviewInfoLine(row())).toBe('Submitted by Mia. Waiting for your approval.');
    expect(rejectConfirm(row())).toBe(
      'It goes back to Mia. They can change it and submit it again.',
    );
  });
});
