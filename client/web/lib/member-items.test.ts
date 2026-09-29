import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberSpaceItemRow } from '@mantle/client-types';
import type { MemberItemRow } from './contract-next';

/**
 * A member's one list (item-list alignment, P4): the request, the pill and
 * State rules the fallback shares with the brain, and the fallback itself on
 * a brain older than GET /api/member/items.
 */
const h = vi.hoisted(() => ({ calls: [] as string[], answers: new Map<string, unknown>() }));

vi.mock('@mantle/web-ui/api-fetch', async (importOriginal) => {
  const real = await importOriginal<typeof import('@mantle/web-ui/api-fetch')>();
  return {
    ...real,
    apiFetch: vi.fn(async (path: string) => {
      h.calls.push(path);
      const base = path.split('?')[0]!;
      const a = h.answers.get(base);
      if (a instanceof Error) throw a;
      if (a === undefined) throw new real.ApiError('not found', 404);
      return a;
    }),
  };
});

const {
  fetchMemberItems,
  memberItemsPath,
  memberStateOf,
  passesState,
  pillOfSpaceRow,
  srcOf,
  MEMBER_STATE_OPTIONS,
} = await import('./member-items');
const { ApiError } = await import('@mantle/web-ui/api-fetch');
const { MEMBER_ITEM_FILTERS } = await import('@mantle/client-types/member-kinds');

const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const space = (
  id: string,
  n: number,
  over: Partial<MemberSpaceItemRow> = {},
): MemberSpaceItemRow => ({
  id,
  type: 'page',
  title: id,
  icon: null,
  sharing: 'private',
  reviewState: 'draft',
  submittedAt: null,
  returnedNote: null,
  authorLoginId: null,
  updatedAt: at(n),
  ...over,
});

beforeEach(() => {
  h.calls = [];
  h.answers = new Map();
});

describe('the request and the URL', () => {
  it('asks for one kind, sending only what narrows it', () => {
    expect(memberItemsPath({ kind: 'page' })).toBe('/api/member/items?kind=page');
    expect(memberItemsPath({ kind: 'note', q: ' plan ', state: 'private', page: 2 })).toBe(
      '/api/member/items?kind=note&q=plan&state=private&page=2',
    );
    expect(memberItemsPath({ kind: 'note', state: 'all', page: 1 })).toBe(
      '/api/member/items?kind=note',
    );
  });

  it('offers every filter the brain takes, All first, and reads unknown as all', () => {
    // `client-requests` (client logins C5) is in the contract from the C5
    // release; the shim adds it until the pin gets there.
    expect(MEMBER_STATE_OPTIONS.map((o) => o.value)).toEqual([
      ...new Set<string>([...MEMBER_ITEM_FILTERS, 'client-requests']),
    ]);
    expect(MEMBER_STATE_OPTIONS.at(-1)).toEqual({
      value: 'client-requests',
      label: 'Client requests',
    });
    expect(memberStateOf(new URLSearchParams('state=submitted'))).toBe('submitted');
    expect(memberStateOf(new URLSearchParams('state=client-requests'))).toBe('client-requests');
    expect(memberStateOf(new URLSearchParams('state=secret'))).toBe('all');
    expect(memberStateOf(null)).toBe('all');
  });

  it('names the item view the old way in the URL (links still use it)', () => {
    expect(srcOf('own')).toBe('mine');
    expect(srcOf('team')).toBe('team');
    expect(srcOf('library')).toBe('library');
    expect(srcOf('accepted')).toBe('accepted');
    // A client's submitted item opens its own read-only view (C5).
    expect(srcOf('client-request')).toBe('client-request');
  });
});

describe('pills and the State filter', () => {
  it('names the review state first, then who can see a draft (the brain’s pillOf)', () => {
    expect(pillOfSpaceRow(space('a', 1))).toBe('private');
    expect(pillOfSpaceRow(space('a', 1, { sharing: 'team' }))).toBe('draft');
    expect(pillOfSpaceRow(space('a', 1, { reviewState: 'submitted' }))).toBe('submitted');
    expect(pillOfSpaceRow(space('a', 1, { reviewState: 'returned' }))).toBe('returned');
    expect(pillOfSpaceRow(space('a', 1, { reviewState: 'with-admin' }))).toBe('with-admin');
  });

  it('finds a row under exactly the filter its pill names, and brain rows under Brain', () => {
    const row = (pill: MemberItemRow['pill'], byMe = false) => ({ pill, byMe }) as MemberItemRow;
    expect(passesState(row('private'), 'private')).toBe(true);
    expect(passesState(row('private'), 'draft')).toBe(false);
    expect(passesState(row(null), 'brain')).toBe(true);
    expect(passesState(row('draft'), 'brain')).toBe(false);
    expect(passesState(row(null, true), 'by-me')).toBe(true);
    expect(passesState(row('submitted'), 'all')).toBe(true);
  });

  it('finds client requests under Client requests only (C5)', () => {
    const req = { pill: 'submitted', byMe: false, source: 'client-request' } as MemberItemRow;
    const own = { pill: 'submitted', byMe: false, source: 'own' } as MemberItemRow;
    expect(passesState(req, 'client-requests')).toBe(true);
    expect(passesState(own, 'client-requests')).toBe(false);
  });
});

describe('fetchMemberItems', () => {
  it('reads the brain’s one list when it has the route', async () => {
    h.answers.set('/api/member/items', { items: [], total: 0, page: 1, pageSize: 50 });
    await fetchMemberItems({ kind: 'page', state: 'all', page: 1 });
    expect(h.calls).toEqual(['/api/member/items?kind=page']);
  });

  it('on an older brain merges the four source lists newest first, once each item', async () => {
    h.answers.set('/api/member/space', { items: [space('own', 5)], total: 1 });
    h.answers.set('/api/member/team-drafts', {
      items: [space('mate', 7, { sharing: 'team', reviewState: 'submitted' })],
      total: 1,
    });
    h.answers.set('/api/member/library', {
      items: [
        {
          id: 'lib',
          type: 'page',
          title: 'lib',
          icon: null,
          summary: 's',
          audience: 'client',
          updatedAt: at(9),
          author: null,
        },
      ],
      total: 1,
    });
    h.answers.set('/api/member/accepted', {
      items: [
        // At team level it is a Library row already: listed once.
        {
          id: 'lib',
          type: 'page',
          title: 'lib',
          icon: null,
          audience: 'team',
          acceptedAt: null,
          updatedAt: at(9),
        },
        {
          id: 'acc',
          type: 'page',
          title: 'acc',
          icon: null,
          audience: 'admin',
          acceptedAt: null,
          updatedAt: at(3),
        },
      ],
      total: 2,
    });
    const res = await fetchMemberItems({ kind: 'page', state: 'all', page: 1 });
    expect(res.items.map((r) => [r.id, r.source, r.pill])).toEqual([
      ['lib', 'library', null],
      ['mate', 'team', 'submitted'],
      ['own', 'own', 'private'],
      ['acc', 'accepted', null],
    ]);
    const priv = await fetchMemberItems({ kind: 'page', state: 'private', page: 1 });
    expect(priv.items.map((r) => r.id)).toEqual(['own']);
  });

  it('asks the brain for client requests, and a brain before C5 (400) shows none', async () => {
    h.answers.set('/api/member/items', new ApiError('Invalid query.', 400));
    const res = await fetchMemberItems({ kind: 'page', state: 'client-requests', page: 1 });
    expect(h.calls).toEqual(['/api/member/items?kind=page&state=client-requests']);
    expect(res.items).toEqual([]);
    // Any other filter's 400 is still an error.
    await expect(fetchMemberItems({ kind: 'page', state: 'private', page: 1 })).rejects.toThrow(
      'Invalid query.',
    );
  });

  it('rethrows anything but a missing route', async () => {
    h.answers.set('/api/member/items', new ApiError('boom', 500));
    await expect(fetchMemberItems({ kind: 'page', state: 'all', page: 1 })).rejects.toThrow('boom');
  });
});
