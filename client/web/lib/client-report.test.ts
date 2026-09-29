import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { ClientReportAckResponse } from '@mantle/client-types';
import type { ClientReport } from '@mantle/client-types';

/**
 * "What clients see" (client logins C1): the ack sends exactly the ids on
 * the screen, and the words say who checked the list, when, and what went
 * to client since.
 */
const sent = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@mantle/web-ui/api-fetch', async (importActual) => {
  const actual = await importActual<typeof import('@mantle/web-ui/api-fetch')>();
  return {
    ...actual,
    apiSend: vi.fn(async (...args: unknown[]) => {
      sent.calls.push(args);
      return {
        acknowledgement: {
          ackedAt: '2026-09-28T10:00:00.000Z',
          ackedBy: { id: 'u1', name: 'Ada Admin' },
          itemCount: 2,
        },
        acknowledged: true,
      } satisfies ClientReportAckResponse;
    }),
  };
});

const {
  ackBody,
  acknowledgeClientReport,
  afterAck,
  ackLine,
  isReportChanged,
  isReportMissing,
  NOT_ON_THIS_BRAIN,
  linkViewsLine,
  newSinceIds,
  newSinceLine,
  oldLinkAboveLine,
  refLabel,
  sharedLinkHref,
  shownIds,
  shownLine,
} = await import('./client-report');

afterEach(() => {
  sent.calls = [];
});

const item = (id: string, over: Partial<ClientReport['items'][number]> = {}) => ({
  id,
  type: 'page',
  title: `Item ${id}`,
  updatedAt: '2026-09-20T08:00:00.000Z',
  link: null,
  emailedTo: [],
  refsAbove: [],
  ...over,
});

const report = (over: Partial<ClientReport> = {}): ClientReport => ({
  items: [item('a'), item('b')],
  total: 2,
  acknowledgement: null,
  acknowledged: false,
  newSinceAck: [],
  ...over,
});

describe('the acknowledgement', () => {
  it('sends the fingerprint of the whole set when the brain gives one', async () => {
    const r = report({ fingerprint: 'f'.repeat(64) });
    expect(ackBody(r)).toEqual({ fingerprint: 'f'.repeat(64) });
    await acknowledgeClientReport(ackBody(r));
    expect(sent.calls).toEqual([
      ['/api/access/client-report/ack', 'POST', { fingerprint: 'f'.repeat(64) }],
    ]);
  });

  it('a brain without a fingerprint gets exactly the ids on the screen', async () => {
    const r = report();
    await acknowledgeClientReport(ackBody(r));
    expect(sent.calls).toEqual([
      ['/api/access/client-report/ack', 'POST', { itemIds: ['a', 'b'] }],
    ]);
    expect(shownIds(r)).toEqual(['a', 'b']);
  });

  it('posts an empty list when nothing is at client (it still acknowledges)', async () => {
    await acknowledgeClientReport(ackBody(report({ items: [], total: 0 })));
    expect(sent.calls).toEqual([['/api/access/client-report/ack', 'POST', { itemIds: [] }]]);
  });

  it('by ids: leaves the report acknowledged, and nothing shown still new', async () => {
    const r = report({ newSinceAck: ['b', 'z'] });
    const res = await acknowledgeClientReport({ itemIds: ['a', 'b'] });
    const next = afterAck(r, res, { itemIds: ['a', 'b'] });
    expect(next.acknowledged).toBe(true);
    expect(next.acknowledgement?.ackedBy?.name).toBe('Ada Admin');
    // 'z' was not on the screen: still new.
    expect(next.newSinceAck).toEqual(['z']);
    expect(next.items).toBe(r.items);
  });

  it('by fingerprint: the whole set is covered, nothing is new', async () => {
    const r = report({ newSinceAck: ['b', 'z'], fingerprint: 'abc' });
    const res = await acknowledgeClientReport({ fingerprint: 'abc' });
    expect(afterAck(r, res, { fingerprint: 'abc' }).newSinceAck).toEqual([]);
  });

  it("knows the brain's report-changed refusal, and nothing else", () => {
    const changed = new ApiError('The list changed.', 409, {
      error: 'conflict',
      reason: 'report-changed',
    });
    expect(isReportChanged(changed)).toBe(true);
    expect(isReportChanged(new ApiError('x', 409, { reason: 'other' }))).toBe(false);
    expect(isReportChanged(new ApiError('x', 400, { reason: 'report-changed' }))).toBe(false);
    expect(isReportChanged(new Error('report-changed'))).toBe(false);
  });
});

describe('New since checked', () => {
  it('marks nothing before the first check (the brain names every item then)', () => {
    const r = report({ newSinceAck: ['a', 'b'], acknowledgement: null });
    expect(newSinceIds(r).size).toBe(0);
  });

  it('after a check, marks what went to client since, as a Set', () => {
    const r = report({
      newSinceAck: ['b'],
      acknowledgement: { ackedAt: '2026-09-28T10:00:00.000Z', ackedBy: null, itemCount: 1 },
    });
    const ids = newSinceIds(r);
    expect(ids).toBeInstanceOf(Set);
    expect([...ids]).toEqual(['b']);
  });
});

describe('the words', () => {
  it('says who checked the list, when, and how much was on it', () => {
    const line = ackLine({
      ackedAt: '2026-09-28T10:00:00.000Z',
      ackedBy: { id: 'u1', name: 'Ada Admin' },
      itemCount: 1,
    });
    expect(line).toMatch(/^Ada Admin checked this list on .+ \(1 item\)\.$/);
    expect(line).toMatch(/2026|28/);
    expect(ackLine({ ackedAt: '2026-09-28T10:00:00.000Z', ackedBy: null, itemCount: 3 })).toMatch(
      /^An admin who has since been removed checked this list on .+ \(3 items\)\.$/,
    );
  });

  it('asks again for what went to client since', () => {
    expect(newSinceLine(report({ newSinceAck: ['a'] }))).toBe(
      '1 item went to client since then. Check the list again.',
    );
    expect(newSinceLine(report({ newSinceAck: ['a', 'b'] }))).toBe(
      '2 items went to client since then. Check the list again.',
    );
  });

  it('tells new items past the ones shown apart from new items on the list', () => {
    const cut = { total: 2500 };
    expect(newSinceLine(report({ ...cut, newSinceAck: ['a', 'x', 'y'] }))).toBe(
      '3 items went to client since then. 2 of them are past the 2 shown here. Check the list again.',
    );
    expect(newSinceLine(report({ ...cut, newSinceAck: ['x'] }))).toBe(
      '1 item went to client since then. It is past the 2 shown here. Check the list again.',
    );
    expect(newSinceLine(report({ ...cut, newSinceAck: ['x', 'y'] }))).toBe(
      '2 items went to client since then. They are past the 2 shown here. Check the list again.',
    );
  });

  it('says when the list is cut short, and what the check covers', () => {
    expect(shownLine(report())).toBeNull();
    expect(shownLine(report({ total: 2500, fingerprint: 'f' }))).toBe(
      'Showing 2 of 2500 client items. Checking the list covers all 2500.',
    );
    expect(shownLine(report({ total: 2500 }))).toBe(
      'Showing 2 of 2500 client items. Only the ones shown can be checked on this brain.',
    );
  });

  it('names an old link above an item, and opens Shared links at it', () => {
    const l = { shareId: 's 1', nodeId: 'f', title: 'Handover', type: 'branch' };
    expect(oldLinkAboveLine({ ...l, via: 'folder' })).toBe(
      'Reachable through the old link on the folder Handover',
    );
    expect(oldLinkAboveLine({ ...l, title: ' ', via: 'page' })).toBe(
      'Reachable through the old link on the page Untitled',
    );
    expect(sharedLinkHref('s 1')).toBe('/team-admin?view=shares&share=s%201');
  });

  it('names what a client may not read, with its level', () => {
    expect(refLabel({ id: '1', type: 'page', title: 'Pricing', audience: 'team' })).toBe(
      'Pricing (Team)',
    );
    expect(refLabel({ id: '2', type: 'note', title: ' ', audience: 'admin' })).toBe(
      'Untitled (Admin)',
    );
    // Not a brain item: never its title, whatever an older brain sent.
    expect(refLabel({ id: '3', type: 'journal', title: 'Diary', audience: null })).toBe(
      'An item outside the brain',
    );
    expect(refLabel({ id: '4', type: null, title: null, audience: null })).toBe(
      'An item outside the brain',
    );
    for (const ref of [
      { id: '3', type: 'journal', title: 'Diary', audience: null },
      { id: '5', type: 'page', title: 'Secret', audience: null },
    ] as const) {
      expect(refLabel(ref)).not.toContain(ref.title);
      expect(refLabel(ref)).not.toContain('not in the brain');
    }
  });

  it("counts an old link's views", () => {
    const link = {
      id: 's',
      createdAt: '2026-01-01T00:00:00.000Z',
      viewCount: 1,
      lastViewedAt: null,
      expiresAt: null,
    };
    expect(linkViewsLine(link)).toBe('1 view');
    expect(
      linkViewsLine({ ...link, viewCount: 7, lastViewedAt: '2026-09-01T09:00:00.000Z' }),
    ).toMatch(/^7 views, last .+/);
  });
});

describe('a brain without the report', () => {
  it('is a 404, and only a 404', () => {
    expect(isReportMissing(new ApiError('Not found.', 404))).toBe(true);
    expect(isReportMissing(new ApiError('boom', 500))).toBe(false);
    expect(isReportMissing(new TypeError('x'))).toBe(false);
    expect(NOT_ON_THIS_BRAIN).toBe('This brain does not have this yet.');
  });
});
