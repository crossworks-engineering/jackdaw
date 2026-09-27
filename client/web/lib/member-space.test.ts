import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  MEMBER_MAX_UPLOAD_BYTES,
  commentsOpen,
  isEditable,
  memberUploadRefusal,
  refusalMessage,
  resolveMemberSource,
  reviewListPath,
  acceptedPlace,
  listPath,
  splitByReview,
  workspaceNavMode,
  workspaceQuery,
  type ReviewState,
  type SpaceSource,
} from './member-space';

describe('workspaceQuery', () => {
  it('Close drops the id a redirect wrote as ?selected= (and its edit flag)', () => {
    expect(workspaceQuery('selected=n1&edit=1', { id: null })).toBe('');
  });

  it('switching the source closes the item whichever key opened it', () => {
    expect(workspaceQuery('selected=n1&edit=1', { src: 'team', id: null })).toBe('src=team');
    expect(workspaceQuery('id=n1', { src: 'library', id: null })).toBe('src=library');
  });

  it('opening an item replaces a redirect selection with ?id=', () => {
    expect(workspaceQuery('selected=n1&edit=1', { id: 'n2' })).toBe('id=n2');
  });

  it('a source change alone keeps the open item and other params', () => {
    expect(workspaceQuery('id=n1&q=x', { src: 'mine' })).toBe('id=n1&q=x');
  });
});

describe('refusalMessage', () => {
  it("prefers the brain's own sentence", () => {
    const err = new ApiError('Your space holds 2 GB.', 409, {
      error: 'Your space holds 2 GB.',
      reason: 'quota',
    });
    expect(refusalMessage(err)).toBe('Your space holds 2 GB.');
  });

  it('names quota, embed and rate limits when the brain sent no sentence', () => {
    expect(refusalMessage(new ApiError('409 Conflict', 409, { reason: 'quota' }))).toMatch(
      /space is full/,
    );
    expect(
      refusalMessage(new ApiError('409 Conflict', 409, { reason: 'embed', ids: ['x'] })),
    ).toMatch(/cannot share/);
    expect(refusalMessage(new ApiError('429', 429, { error: 'rate-limit' }))).toMatch(
      /Too many requests/,
    );
    expect(refusalMessage(new ApiError('429', 429, { reason: 'rate-limit' }))).toMatch(
      /Too many requests/,
    );
  });

  it('leaves the fallback to the caller otherwise', () => {
    expect(refusalMessage(new ApiError('forbidden', 403, { error: 'forbidden' }))).toBeNull();
    expect(refusalMessage(new TypeError('Failed to fetch'))).toBeNull();
  });
});

describe('workspaceNavMode', () => {
  it('opening an item is a new history entry (Back returns to the list)', () => {
    expect(workspaceNavMode('', { id: 'n1' })).toBe('push');
    expect(workspaceNavMode('src=team', { id: 'n1' })).toBe('push');
    // Another item while one is open, and a new item after create.
    expect(workspaceNavMode('id=n1', { id: 'n2' })).toBe('push');
    expect(workspaceNavMode('id=n1', { src: 'mine', id: 'n2' })).toBe('push');
  });

  it('closing, switching the source and normalising a redirect replace it', () => {
    expect(workspaceNavMode('id=n1', { id: null })).toBe('replace');
    expect(workspaceNavMode('id=n1', { src: 'library', id: null })).toBe('replace');
    expect(workspaceNavMode('selected=n1&edit=1', { id: 'n1' })).toBe('replace');
    expect(workspaceNavMode('', { src: 'team' })).toBe('replace');
  });
});

describe('member upload cap', () => {
  it('refuses a file over the brain cap before it is sent, naming both sizes', () => {
    expect(MEMBER_MAX_UPLOAD_BYTES).toBe(100 * 1024 * 1024);
    expect(memberUploadRefusal(MEMBER_MAX_UPLOAD_BYTES)).toBeNull();
    expect(memberUploadRefusal(1024)).toBeNull();
    expect(memberUploadRefusal(MEMBER_MAX_UPLOAD_BYTES + 1)).toBe(
      'This file is over the 100 MB upload limit.',
    );
    expect(memberUploadRefusal(250 * 1024 * 1024)).toBe(
      'This file is 250 MB, over the 100 MB upload limit.',
    );
  });
});

describe('the home review lists', () => {
  it('reads returned and submitted items with the review filter, not the newest page', () => {
    const url = new URL(reviewListPath(['returned', 'submitted']), 'http://x');
    expect(url.pathname).toBe('/api/member/space');
    expect(url.searchParams.get('review')).toBe('returned,submitted');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.has('kind')).toBe(false);
  });

  it('splits one answer into the two lists (also what an older brain sends)', () => {
    const rows: { id: string; reviewState: ReviewState }[] = [
      { id: 'a', reviewState: 'draft' },
      { id: 'b', reviewState: 'submitted' },
      { id: 'c', reviewState: 'returned' },
      { id: 'd', reviewState: 'accepted' },
      { id: 'e', reviewState: 'submitted' },
    ];
    const { returned, submitted } = splitByReview(rows);
    expect(returned.map((r) => r.id)).toEqual(['c']);
    expect(submitted.map((r) => r.id)).toEqual(['b', 'e']);
  });
});

describe('resolveMemberSource', () => {
  const found = (where: SpaceSource[], fail?: { source: SpaceSource; err: unknown }) => {
    const asked: SpaceSource[] = [];
    const probe = async (source: SpaceSource) => {
      asked.push(source);
      if (fail?.source === source) throw fail.err;
      if (!where.includes(source)) throw new ApiError('Not found.', 404, { error: 'Not found.' });
      return {};
    };
    return { asked, probe };
  };

  it('opens an own item in Mine', async () => {
    const { asked, probe } = found(['mine', 'library']);
    await expect(resolveMemberSource(probe)).resolves.toBe('mine');
    expect(asked).toEqual(['mine']);
  });

  it('opens a teammate draft in Team drafts and a Library item in the Library', async () => {
    const team = found(['team']);
    await expect(resolveMemberSource(team.probe)).resolves.toBe('team');
    expect(team.asked).toEqual(['mine', 'team']);
    const lib = found(['library']);
    await expect(resolveMemberSource(lib.probe)).resolves.toBe('library');
    expect(lib.asked).toEqual(['mine', 'team', 'library']);
  });

  it('opens an item the member wrote and an admin accepted, last', async () => {
    const acc = found(['accepted']);
    await expect(resolveMemberSource(acc.probe)).resolves.toBe('accepted');
    expect(acc.asked).toEqual(['mine', 'team', 'library', 'accepted']);
    // At team level it is in the Library too: the Library wins.
    const both = found(['library', 'accepted']);
    await expect(resolveMemberSource(both.probe)).resolves.toBe('library');
  });

  it('answers null when no source has it (a bad id counts as missing)', async () => {
    await expect(resolveMemberSource(found([]).probe)).resolves.toBeNull();
    const bad = found([], { source: 'mine', err: new ApiError('Invalid id.', 400) });
    await expect(resolveMemberSource(bad.probe)).resolves.toBeNull();
  });

  it('stops at any other failure and falls back to Mine', async () => {
    const down = found(['library'], { source: 'team', err: new TypeError('Failed to fetch') });
    await expect(resolveMemberSource(down.probe)).resolves.toBe('mine');
    expect(down.asked).toEqual(['mine', 'team']);
  });
});

describe('isEditable', () => {
  it('lets a member edit a draft or a returned item only', () => {
    expect(isEditable({ reviewState: 'draft' })).toBe(true);
    expect(isEditable({ reviewState: 'returned' })).toBe(true);
    // Submitted is frozen until Recall, Accept or Return; accepted is done.
    expect(isEditable({ reviewState: 'submitted' })).toBe(false);
    expect(isEditable({ reviewState: 'accepted' })).toBe(false);
  });
});

describe('commentsOpen', () => {
  it('opens the thread while an own item is shared or submitted', () => {
    expect(commentsOpen({ sharing: 'team', reviewState: 'draft' })).toBe(true);
    // A private item under review carries the review discussion.
    expect(commentsOpen({ sharing: 'private', reviewState: 'submitted' })).toBe(true);
    expect(commentsOpen({ sharing: 'private', reviewState: 'draft' })).toBe(false);
    expect(commentsOpen({ sharing: 'private', reviewState: 'returned' })).toBe(false);
  });
});

describe('accepted items (Phase 4)', () => {
  it('lists and reads from the accepted routes', () => {
    expect(listPath('accepted', { kind: 'page', q: ' plan ', page: 2 })).toBe(
      '/api/member/accepted?kind=page&page=2&q=plan',
    );
  });

  it('says where an accepted item sits now', () => {
    expect(acceptedPlace('admin')).toBe('Admins only');
    expect(acceptedPlace('team')).toBe('In the Library');
    expect(acceptedPlace('public')).toBe('In the Library');
  });
});
