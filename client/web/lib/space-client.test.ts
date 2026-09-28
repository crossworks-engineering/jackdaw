import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_API_BASE,
  adminSpace,
  isAdminSpace,
  listPath,
  memberSpace,
  ownListPath,
  spaceClient,
  type SpaceClient,
} from './member-space';
import { rescuePaths } from './member-rescue';

/** Every request a client makes, as `METHOD path?query`, with its JSON body. */
let calls: { method: string; url: string; body: unknown }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body =
      typeof init?.body === 'string'
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? 'form'
          : undefined;
    calls.push({ method: init?.method ?? 'GET', url, body });
    return new Response(JSON.stringify({ item: { id: 'x' }, row: { id: 'x' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Drive every own-space call a client has, once each. */
async function driveOwnSpace(client: SpaceClient) {
  await client.create({ type: 'page', title: 'T' });
  await client.item('i1');
  await client.item('i1', 'tab 2');
  await client.patch('i1', { title: 'T2' });
  await client.remove('i1');
  await client.draft('i1', { doc: {}, if_rev: 3 });
  await client.save('i1', { doc: {}, if_rev: 4 });
  await client.upload(new File(['x'], 'a.txt'));
}

const OWN_SPACE_CALLS = (base: string) => [
  `POST ${base}/space`,
  `GET ${base}/space/i1`,
  `GET ${base}/space/i1?tab=tab%202`,
  `PATCH ${base}/space/i1`,
  `DELETE ${base}/space/i1`,
  `PUT ${base}/space/i1/draft`,
  `POST ${base}/space/i1/save`,
  `POST ${base}/space-files`,
];

describe('spaceClient: one client, two bases (member logins Phase 7)', () => {
  it('a member client keeps every route it had under /api/member', async () => {
    await driveOwnSpace(memberSpace);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(OWN_SPACE_CALLS('/api/member'));
    expect(memberSpace.bytesPath('i1')).toBe('/api/member/space/i1/bytes');
    expect(memberSpace.listPath({ kind: 'note', q: ' a ', page: 2 })).toBe(
      '/api/member/space?kind=note&page=2&q=a',
    );
    // The member list and the default base are the same path as before.
    expect(listPath('mine', { kind: 'page' })).toBe(ownListPath({ kind: 'page' }));
    expect(listPath('mine', { kind: 'page' })).toBe('/api/member/space?kind=page&page=1');
  });

  it('the admin client sends the same calls, bodies and queries under /api/admin', async () => {
    await driveOwnSpace(adminSpace);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(OWN_SPACE_CALLS('/api/admin'));
    expect(calls[0]!.body).toEqual({ type: 'page', title: 'T' });
    expect(calls[5]!.body).toEqual({ doc: {}, if_rev: 3 });
    expect(adminSpace.bytesPath('i1')).toBe('/api/admin/space/i1/bytes');
    expect(adminSpace.listPath({ kind: 'file', page: 3 })).toBe(
      '/api/admin/space?kind=file&page=3',
    );
  });

  it('member and admin send identical bodies for the same call', async () => {
    await driveOwnSpace(memberSpace);
    const member = calls.map((c) => c.body);
    calls = [];
    await driveOwnSpace(adminSpace);
    expect(calls.map((c) => c.body)).toEqual(member);
  });

  it('accept posts the submission accept body to the admin item', async () => {
    const input = { audience: 'team' as const, parentPageId: null, folderPath: 'files.docs' };
    await adminSpace.accept('i1', input);
    expect(calls).toEqual([{ method: 'POST', url: '/api/admin/space/i1/accept', body: input }]);
  });

  it('the admin client has nothing that reaches another person', () => {
    for (const k of ['get', 'share', 'submit', 'recall', 'comments', 'addComment', 'deleteComment'])
      expect(k in adminSpace).toBe(false);
    expect(isAdminSpace(adminSpace)).toBe(true);
    expect(isAdminSpace(memberSpace)).toBe(false);
    expect(adminSpace.base).toBe(ADMIN_API_BASE);
  });

  it('no admin call ever reaches /api/member', async () => {
    await driveOwnSpace(adminSpace);
    await adminSpace.accept('i1', { audience: 'admin' });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.url.startsWith('/api/admin/')).toBe(true);
  });

  it('defaults to the member base', () => {
    expect(spaceClient().base).toBe('/api/member');
  });

  it('a reload rescue replays onto the base the write went to', () => {
    expect(rescuePaths('i1')).toEqual(['/api/member/space/i1/draft', '/api/member/space/i1']);
    expect(rescuePaths('i1', '/api/admin')).toEqual([
      '/api/admin/space/i1/draft',
      '/api/admin/space/i1',
    ]);
  });
});
