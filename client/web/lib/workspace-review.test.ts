import { describe, expect, it } from 'vitest';
import type { ReviewItemRow } from './member-review';
import { reviewRowsOf, waitingByWorkspace } from './workspace-review';

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

describe('workspace review, kept for Team admin until it goes (W5c)', () => {
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
});
