import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import {
  CLIENT_ACCEPTED_KEY,
  CLIENT_COMMENTS_POLL_MS,
  CLIENT_KIND_OPTIONS,
  CLIENT_REQUESTS_KEY,
  CLIENT_STATE_OPTIONS,
  CLIENT_THREAD_CHIPS,
  CLIENT_VIEW_HREF,
  MEMBER_THREAD_CHIPS,
  acceptedStamp,
  askUnlessMissing,
  forgetMissingRoutes,
  clientAcceptedPath,
  clientItemsPath,
  clientKindOf,
  clientRequestBytesPath,
  clientRequestPath,
  clientRequestsEmpty,
  clientRowQuery,
  clientSrcOf,
  clientStateOf,
  clientUploadRefusal,
  clientViewOf,
  commentPath,
  commentsPollMs,
  isMissingRoute,
  libraryCommentsPath,
  sharedCommentsPath,
} from './client-requests';
import { CLIENT_ITEM_FILTERS } from '@mantle/client-types/member-kinds';
import {
  CLIENT_MAX_UPLOAD_BYTES,
  clientSpace,
  isAdminSpace,
  isClientSpace,
  memberSpace,
  adminSpace,
  reviewClient,
  spaceCommentsPath,
} from './member-space';
import { CLIENT_OWN_ITEM_KEY, refreshClientPortal } from './client-portal';

/**
 * A client's own items (client logins C5): My requests' routes and URL
 * state, the client upload cap, the client space's routes, and the comment
 * threads on client-level items, with what an older brain's 404 means.
 */
const ID = '11111111-1111-4111-8111-111111111111';

describe('the two client screens', () => {
  it('reads the screen from `view`, Shared with you unless it says requests', () => {
    expect(clientViewOf(new URLSearchParams('view=requests'))).toBe('requests');
    expect(clientViewOf(new URLSearchParams('view=other'))).toBe('shared');
    expect(clientViewOf(new URLSearchParams(''))).toBe('shared');
    expect(clientViewOf(null)).toBe('shared');
  });

  it('starts each screen clean, at the one client path', () => {
    expect(CLIENT_VIEW_HREF).toEqual({ shared: '/', requests: '/?view=requests' });
  });
});

describe('My requests: the list', () => {
  it('asks the client route, sending only what narrows it', () => {
    expect(clientItemsPath({})).toBe('/api/client/items?page=1');
    expect(clientItemsPath({ kind: 'note', q: ' plan ', state: 'returned', page: 2 })).toBe(
      '/api/client/items?kind=note&q=plan&state=returned&page=2',
    );
    expect(clientItemsPath({ state: 'all' })).toBe('/api/client/items?page=1');
  });

  it('offers the three client kinds and every state the brain takes, All first', () => {
    expect(CLIENT_KIND_OPTIONS.map((o) => o.value)).toEqual(['all', 'page', 'note', 'file']);
    expect(CLIENT_KIND_OPTIONS.map((o) => o.label)).toEqual([
      'Everything',
      'Pages',
      'Notes',
      'Files',
    ]);
    expect(CLIENT_STATE_OPTIONS.map((o) => o.value)).toEqual([...CLIENT_ITEM_FILTERS]);
    expect(CLIENT_STATE_OPTIONS[0]).toEqual({ value: 'all', label: 'All items' });
    // Never a Team draft: a client does not share with the team.
    expect(CLIENT_STATE_OPTIONS.map((o) => o.value)).not.toContain('draft');
  });

  it('reads the URL: a kind and a state the client has, else none', () => {
    const p = new URLSearchParams('kind=file&state=submitted');
    expect(clientKindOf(p)).toBe('file');
    expect(clientStateOf(p)).toBe('submitted');
    const bad = new URLSearchParams('kind=draw&state=draft');
    expect(clientKindOf(bad)).toBeNull();
    expect(clientStateOf(bad)).toBe('all');
    expect(clientKindOf(null)).toBeNull();
    expect(clientStateOf(null)).toBe('all');
  });

  it('opens a row by id, an accepted one with src=accepted, the list state kept', () => {
    expect(clientRowQuery('view=requests&state=returned', { id: ID, src: 'own' })).toBe(
      `view=requests&state=returned&id=${ID}`,
    );
    expect(clientRowQuery('view=requests', { id: ID, src: 'accepted' })).toBe(
      `view=requests&id=${ID}&src=accepted`,
    );
    // Closing drops both.
    expect(clientRowQuery(`view=requests&id=${ID}&src=accepted`, { id: null })).toBe(
      'view=requests',
    );
    expect(clientSrcOf(new URLSearchParams('src=accepted'))).toBe('accepted');
    expect(clientSrcOf(new URLSearchParams('src=team'))).toBe('own');
  });

  it('says why the list is empty', () => {
    expect(clientRequestsEmpty({ q: '', kind: null, state: 'all' })).toMatch(/^Nothing here yet/);
    expect(clientRequestsEmpty({ q: 'x', kind: null, state: 'all' })).toBe('Nothing matches that.');
    expect(clientRequestsEmpty({ q: '', kind: 'note', state: 'all' })).toBe(
      'Nothing matches that.',
    );
    expect(clientRequestsEmpty({ q: '', kind: null, state: 'returned' })).toBe(
      'Nothing matches that.',
    );
  });

  it('stamps an accepted row with when, and an own row with nothing', () => {
    expect(acceptedStamp({ source: 'own', acceptedAt: null })).toBeNull();
    expect(acceptedStamp({ source: 'accepted', acceptedAt: null })).toBe('accepted');
    expect(acceptedStamp({ source: 'accepted', acceptedAt: '2026-09-20T10:00:00.000Z' })).toBe(
      `accepted ${formatDate('2026-09-20T10:00:00.000Z')}`,
    );
  });

  it('reads an accepted item from the client route', () => {
    expect(clientAcceptedPath(ID)).toBe(`/api/client/accepted/${ID}`);
  });
});

describe('the client upload cap: 20 MB a file', () => {
  it('lets 20 MB go and refuses a byte more, naming both sizes', () => {
    expect(CLIENT_MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(clientUploadRefusal(CLIENT_MAX_UPLOAD_BYTES)).toBeNull();
    expect(clientUploadRefusal(25 * 1024 * 1024)).toBe(
      'This file is 25 MB, over the 20 MB upload limit.',
    );
    expect(clientUploadRefusal(CLIENT_MAX_UPLOAD_BYTES + 1)).toBe(
      'This file is over the 20 MB upload limit.',
    );
  });
});

describe('the client space', () => {
  it('is the member space routes under /api/client, with its own review', () => {
    expect(clientSpace.base).toBe('/api/client');
    expect(isClientSpace(clientSpace)).toBe(true);
    expect(isAdminSpace(clientSpace)).toBe(false);
    expect(isClientSpace(memberSpace)).toBe(false);
    expect(clientSpace.bytesPath(ID)).toBe(`/api/client/space/${ID}/bytes`);
    expect(clientSpace.listPath({ kind: 'page' })).toBe('/api/client/space?kind=page&page=1');
    // No share route: a client never shares.
    expect('share' in clientSpace).toBe(false);
  });

  it('submits and recalls on the client routes, a member on its own', () => {
    expect(reviewClient(clientSpace)).toBe(clientSpace);
    expect(reviewClient(memberSpace)).toBe(memberSpace);
  });

  it('keeps the review talk on the client route, a member’s on its own', () => {
    expect(spaceCommentsPath(clientSpace, 'mine', ID)).toBe(`/api/client/space/${ID}/comments`);
    expect(spaceCommentsPath(memberSpace, 'mine', ID)).toBe(`/api/member/space/${ID}/comments`);
    expect(spaceCommentsPath(memberSpace, 'team', ID)).toBe(
      `/api/member/team-drafts/${ID}/comments`,
    );
    expect(spaceCommentsPath(adminSpace, 'mine', ID)).toBe(`/api/member/space/${ID}/comments`);
  });
});

describe('older brains', () => {
  it('reads a 404 as a route this brain does not have, nothing else', () => {
    expect(isMissingRoute(new ApiError('Not found', 404))).toBe(true);
    expect(isMissingRoute(new ApiError('boom', 500))).toBe(false);
    expect(isMissingRoute(new ApiError('forbidden', 403))).toBe(false);
    expect(isMissingRoute(new Error('offline'))).toBe(false);
    expect(isMissingRoute(null)).toBe(false);
  });

  it('polls a thread every 30 seconds, and stops for one the brain does not have', () => {
    expect(CLIENT_COMMENTS_POLL_MS).toBe(30_000);
    expect(commentsPollMs(null)).toBe(30_000);
    expect(commentsPollMs(new ApiError('boom', 500))).toBe(30_000);
    expect(commentsPollMs(new ApiError('Not found', 404))).toBe(false);
  });
});

describe('the thread on a client-level item (decision 8)', () => {
  it('has a client route and a member route to the same thread', () => {
    expect(sharedCommentsPath(ID)).toBe(`/api/client/shared/${ID}/comments`);
    expect(libraryCommentsPath(ID)).toBe(`/api/member/library/${ID}/comments`);
    expect(commentPath(sharedCommentsPath(ID), 'c 1')).toBe(
      `/api/client/shared/${ID}/comments/c%201`,
    );
  });

  it('marks the other side: a client sees Team, a member sees Client', () => {
    expect(CLIENT_THREAD_CHIPS.client).toBeNull();
    expect(CLIENT_THREAD_CHIPS.member).toBe('Team');
    expect(CLIENT_THREAD_CHIPS.owner).toBe('Team');
    expect(MEMBER_THREAD_CHIPS.client).toBe('Client');
    expect(MEMBER_THREAD_CHIPS.member).toBeNull();
  });
});

describe('a client request, on the member side', () => {
  it('reads it and its bytes from the member routes', () => {
    expect(clientRequestPath(ID)).toBe(`/api/member/client-requests/${ID}`);
    expect(clientRequestBytesPath(ID)).toBe(`/api/member/client-requests/${ID}/bytes`);
  });
});

describe('the client portal refresh (no live stream)', () => {
  it('asks My requests, the open own item and the accepted one again', async () => {
    const qc = new QueryClient();
    const keys = [
      [...CLIENT_REQUESTS_KEY, { kind: null, q: '', state: 'all', page: 1 }],
      [...CLIENT_OWN_ITEM_KEY, 'mine', ID],
      [...CLIENT_ACCEPTED_KEY, ID],
      ['client-shell'],
    ];
    for (const k of keys) qc.setQueryData(k, { ok: true });
    await refreshClientPortal(qc);
    const stale = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated === true;
    expect(stale(keys[0]!)).toBe(true);
    expect(stale(keys[1]!)).toBe(true);
    expect(stale(keys[2]!)).toBe(true);
    expect(stale(keys[3]!)).toBe(false);
  });
});

/**
 * Older brains are asked once (audit U4): after a route's 404 nothing asks
 * it again in this page load, not a poll, a focus refresh or a remount.
 */
describe('askUnlessMissing', () => {
  it('asks once after a 404, then answers the 404 without asking', async () => {
    forgetMissingRoutes();
    let asks = 0;
    const ask = async () => {
      asks += 1;
      throw new ApiError('Not found.', 404);
    };
    await expect(askUnlessMissing('/api/client/items', ask)).rejects.toSatisfy(isMissingRoute);
    await expect(askUnlessMissing('/api/client/items', ask)).rejects.toSatisfy(isMissingRoute);
    await expect(askUnlessMissing('/api/client/items', ask)).rejects.toSatisfy(isMissingRoute);
    expect(asks).toBe(1);
  });

  it('keeps asking a route that answers, or fails another way', async () => {
    forgetMissingRoutes();
    let asks = 0;
    await askUnlessMissing('/api/a', async () => (asks += 1));
    await askUnlessMissing('/api/a', async () => (asks += 1));
    const boom = async () => {
      asks += 1;
      throw new ApiError('Server error', 500);
    };
    await expect(askUnlessMissing('/api/b', boom)).rejects.toBeInstanceOf(ApiError);
    await expect(askUnlessMissing('/api/b', boom)).rejects.toBeInstanceOf(ApiError);
    expect(asks).toBe(4);
  });

  it('remembers each route on its own', async () => {
    forgetMissingRoutes();
    const missing = async () => {
      throw new ApiError('Not found.', 404);
    };
    await expect(askUnlessMissing('/api/x/comments', missing)).rejects.toBeInstanceOf(ApiError);
    await expect(askUnlessMissing('/api/y/comments', async () => 'ok')).resolves.toBe('ok');
  });
});
