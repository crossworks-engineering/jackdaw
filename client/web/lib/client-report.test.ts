import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientReport, ClientReportAckResponse } from './contract-next';

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
  acknowledgeClientReport,
  afterAck,
  ackLine,
  linkViewsLine,
  newSinceLine,
  refLabel,
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
  it('posts exactly the ids on the screen', async () => {
    const r = report();
    await acknowledgeClientReport(shownIds(r));
    expect(sent.calls).toEqual([
      ['/api/access/client-report/ack', 'POST', { itemIds: ['a', 'b'] }],
    ]);
  });

  it('posts an empty list when nothing is at client (it still acknowledges)', async () => {
    await acknowledgeClientReport(shownIds(report({ items: [], total: 0 })));
    expect(sent.calls).toEqual([['/api/access/client-report/ack', 'POST', { itemIds: [] }]]);
  });

  it('leaves the report acknowledged, and nothing shown still new', async () => {
    const r = report({ newSinceAck: ['b', 'z'] });
    const res = await acknowledgeClientReport(['a', 'b']);
    const next = afterAck(r, res, ['a', 'b']);
    expect(next.acknowledged).toBe(true);
    expect(next.acknowledgement?.ackedBy?.name).toBe('Ada Admin');
    // 'z' was not on the screen: still new.
    expect(next.newSinceAck).toEqual(['z']);
    expect(next.items).toBe(r.items);
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
    expect(newSinceLine(1)).toBe('1 item went to client since then. Check the list again.');
    expect(newSinceLine(4)).toBe('4 items went to client since then. Check the list again.');
  });

  it('says when the list is cut short', () => {
    expect(shownLine(report())).toBeNull();
    expect(shownLine(report({ total: 2500 }))).toBe('Showing 2 of 2500 client items.');
  });

  it('names what a client may not read, with its level', () => {
    expect(refLabel({ id: '1', type: 'page', title: 'Pricing', audience: 'team' })).toBe(
      'Pricing (Team)',
    );
    expect(refLabel({ id: '2', type: 'note', title: ' ', audience: 'admin' })).toBe(
      'Untitled (Admin)',
    );
    expect(refLabel({ id: '3', type: 'journal', title: 'Diary', audience: null })).toBe(
      'Diary (not in the brain)',
    );
    expect(refLabel({ id: '4', type: null, title: null, audience: null })).toBe(
      'An item that is gone',
    );
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
