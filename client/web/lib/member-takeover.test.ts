import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  WITH_ADMIN_TEXT,
  acceptedBytesChanged,
  acceptedChangedText,
  adminSpace,
  frozenByOther,
  isEditable,
  isWithAdmin,
  isWithAdminRefusal,
  refusalMessage,
  resolveMemberItem,
  reviewListPath,
  splitByReview,
  statusLabels,
  unsavedBundleIds,
  type SpaceItemState,
  type SpaceSource,
} from './member-space';
import {
  canTakeOver,
  isReleased,
  memberReview,
  reviewCommentsOpen,
  takeOverErrorMessage,
} from './member-review';
import {
  canDeletePrivate,
  canGiveBack,
  giveBackRefusal,
  privateDeleteMessage,
  takenFromOf,
} from './admin-private';

/**
 * Take over and the accepted snapshot (audit F07, brain migration 0183), the
 * client's side: an admin takes a submitted item into their own private
 * items, then accepts it or gives it back; the member meanwhile sees a
 * `with-admin` row and a 409 `with-admin` on every route of it. Plus the
 * bundle refusals of audit F04 (a `frozen` naming the submitted item, and
 * Submit's `unsaved-draft` naming items to save first).
 */

const OWN = '11111111-1111-4111-8111-111111111111';
const HOLDER = '22222222-2222-4222-8222-222222222222';
const CHILD = '33333333-3333-4333-8333-333333333333';

const refusal = (reason: string, extra: Record<string, unknown> = {}, status = 409) =>
  new ApiError(`refused: ${reason}`, status, { reason, ...extra });

describe('the member side of a taken item', () => {
  it('a with-admin row is nobody-can-edit, and a taken row is the admin’s to edit', () => {
    const at = (reviewState: SpaceItemState) => ({ reviewState });
    expect(isEditable(at('with-admin'))).toBe(false);
    expect(isEditable(at('taken'))).toBe(true);
    expect(isEditable(at('draft'))).toBe(true);
    expect(isEditable(at('returned'))).toBe(true);
    expect(isEditable(at('submitted'))).toBe(false);
    expect(isEditable(at('accepted'))).toBe(false);
    expect(isWithAdmin(at('with-admin'))).toBe(true);
    expect(isWithAdmin(at('submitted'))).toBe(false);
  });

  it('the StatusChip says With admin, and nothing about who can see it', () => {
    expect(statusLabels({ sharing: 'private', reviewState: 'with-admin' })).toEqual({
      sharing: null,
      review: 'With admin',
    });
    expect(statusLabels({ sharing: 'team', reviewState: 'submitted' })).toEqual({
      sharing: 'Shared with team',
      review: 'Submitted',
    });
    expect(statusLabels({ sharing: 'private', reviewState: 'draft' })).toEqual({
      sharing: 'Private',
      review: null,
    });
    // An admin's taken row: its "From <member>" badge says the rest.
    expect(statusLabels({ sharing: 'private', reviewState: 'taken' })).toEqual({
      sharing: 'Private',
      review: null,
    });
  });

  it('splits with-admin rows out of a list, apart from the returned and the submitted', () => {
    const rows = [
      { id: 'a', reviewState: 'with-admin' as const },
      { id: 'b', reviewState: 'submitted' as const },
      { id: 'c', reviewState: 'draft' as const },
      { id: 'd', reviewState: 'with-admin' as const },
      { id: 'e', reviewState: 'returned' as const },
    ];
    const split = splitByReview(rows);
    expect(split.withAdmin.map((r) => r.id)).toEqual(['a', 'd']);
    expect(split.submitted.map((r) => r.id)).toEqual(['b']);
    expect(split.returned.map((r) => r.id)).toEqual(['e']);
  });

  it('reads the with-admin list by name (the home asks for it on its own)', () => {
    expect(reviewListPath(['with-admin'])).toBe('/api/member/space?review=with-admin&page=1');
  });

  it('knows a 409 with-admin from any other answer', () => {
    expect(isWithAdminRefusal(refusal('with-admin'))).toBe(true);
    expect(isWithAdminRefusal(refusal('frozen'))).toBe(false);
    expect(isWithAdminRefusal(new ApiError('Not found', 404, { reason: 'with-admin' }))).toBe(
      false,
    );
    expect(isWithAdminRefusal(new Error('with-admin'))).toBe(false);
    expect(isWithAdminRefusal(null)).toBe(false);
  });

  it('says where the item is, in the member’s words, when the brain sends no sentence', () => {
    expect(refusalMessage(new ApiError('with-admin', 409, { reason: 'with-admin' }))).toBe(
      WITH_ADMIN_TEXT,
    );
    expect(WITH_ADMIN_TEXT).toBe(
      'An admin is working on this. You will see it again when it is accepted or given back.',
    );
  });

  it('a link to an own item an admin holds resolves to that, not to "could not open"', async () => {
    const seen: SpaceSource[] = [];
    const found = await resolveMemberItem(async (source) => {
      seen.push(source);
      throw refusal('with-admin');
    });
    expect(found).toEqual({ source: 'mine', kind: null, withAdmin: true });
    expect(seen).toEqual(['mine']);
  });

  it('a with-admin answer from another source is not read as the member’s own', async () => {
    const found = await resolveMemberItem(async (source) => {
      if (source === 'mine') throw new ApiError('Not found', 404);
      throw refusal('with-admin');
    });
    expect(found).toEqual({ source: 'mine', kind: null });
  });
});

describe('the bundle refusals (audit F04)', () => {
  it('a frozen that names ANOTHER item is a bundle item of that submitted item', () => {
    expect(frozenByOther('frozen', [HOLDER], OWN)).toBe(HOLDER);
    // The item's own freeze names itself (or nothing): no holder to link.
    expect(frozenByOther('frozen', [OWN], OWN)).toBeNull();
    expect(frozenByOther('frozen', [], OWN)).toBeNull();
    expect(frozenByOther('not-draft', [HOLDER], OWN)).toBeNull();
    expect(frozenByOther('with-admin', [HOLDER], OWN)).toBeNull();
  });

  it('Submit’s unsaved-draft lists the bundle items to save, never the item itself', () => {
    expect(unsavedBundleIds(refusal('unsaved-draft', { ids: [CHILD, HOLDER] }), OWN)).toEqual([
      CHILD,
      HOLDER,
    ]);
    expect(unsavedBundleIds(refusal('unsaved-draft', { ids: [OWN] }), OWN)).toEqual([]);
    expect(unsavedBundleIds(refusal('unsaved-draft'), OWN)).toEqual([]);
    expect(unsavedBundleIds(refusal('embed', { ids: [CHILD] }), OWN)).toEqual([]);
    expect(unsavedBundleIds(new Error('x'), OWN)).toEqual([]);
  });
});

describe('the Review queue side', () => {
  const row = (reviewState: 'submitted' | 'taken' | 'draft', reason = 'submitted') => ({
    reviewState,
    reason: reason as 'submitted' | 'left-behind',
  });

  it('offers Take over on a submitted or a released item, never on a left-behind draft', () => {
    expect(canTakeOver(row('submitted'))).toBe(true);
    // Left behind but submitted before the author was deactivated: it can.
    expect(canTakeOver(row('submitted', 'left-behind'))).toBe(true);
    expect(canTakeOver(row('taken'))).toBe(true);
    expect(canTakeOver(row('taken', 'left-behind'))).toBe(true);
    // Shared, never submitted: the brain answers 409 not-submitted.
    expect(canTakeOver(row('draft', 'left-behind'))).toBe(false);
  });

  it('marks a released item, and keeps its review comments shut', () => {
    expect(isReleased(row('taken'))).toBe(true);
    expect(isReleased(row('submitted'))).toBe(false);
    expect(reviewCommentsOpen(row('submitted'))).toBe(true);
    expect(reviewCommentsOpen(row('taken'))).toBe(false);
    expect(reviewCommentsOpen(row('submitted', 'left-behind'))).toBe(false);
  });

  it('says why a Take over was refused', () => {
    expect(takeOverErrorMessage(refusal('not-submitted'))).toMatch(/^Only an item that was/);
    expect(takeOverErrorMessage(refusal('too-large'))).toMatch(/more than 200/);
    expect(takeOverErrorMessage(new ApiError('Not found', 404))).toMatch(
      /not waiting for review any more/,
    );
    expect(takeOverErrorMessage(new Error('boom'))).toBe('Could not take this item over.');
  });
});

describe('the admin’s private view of a taken item', () => {
  const from = (canGiveBack: boolean) => ({
    takenFrom: { loginId: 'l1', name: 'Mo Member', canGiveBack, takenAt: null },
  });

  it('gives back only while the member can take it; deletes only once they cannot', () => {
    expect(canGiveBack(from(true))).toBe(true);
    expect(canGiveBack(from(false))).toBe(false);
    expect(canGiveBack({ takenFrom: null })).toBe(false);
    expect(canGiveBack({})).toBe(false);
    // The admin's own item: always theirs to delete.
    expect(canDeletePrivate({ takenFrom: null })).toBe(true);
    expect(canDeletePrivate({})).toBe(true);
    // The member can still take it back: the brain refuses (409 taken).
    expect(canDeletePrivate(from(true))).toBe(false);
    expect(canDeletePrivate(from(false))).toBe(true);
    expect(takenFromOf({})).toBeNull();
    expect(takenFromOf(from(true))?.name).toBe('Mo Member');
  });

  it('sorts a refused Give back: what to say, and the items to act on', () => {
    expect(giveBackRefusal(refusal('author-inactive'))).toEqual({
      kind: 'author-inactive',
      message: expect.stringMatching(/Accept it into the brain, or delete it\.$/),
      ids: [],
    });
    expect(giveBackRefusal(refusal('unsaved-draft', { ids: [CHILD] }))).toEqual({
      kind: 'unsaved-draft',
      message: expect.stringMatching(/^Save a version first/),
      ids: [CHILD],
    });
    expect(giveBackRefusal(refusal('embed', { ids: [HOLDER, CHILD] }))).toEqual({
      kind: 'embed',
      message: expect.stringMatching(/Remove these, save a version, then give it back:$/),
      ids: [HOLDER, CHILD],
    });
    expect(giveBackRefusal(new ApiError('Not found', 404)).kind).toBe('gone');
    expect(giveBackRefusal(new ApiError('invalid', 400, { reason: 'invalid' })).kind).toBe(
      'invalid',
    );
    expect(giveBackRefusal(new Error('x'))).toEqual({
      kind: 'other',
      message: 'Could not give it back.',
      ids: [],
    });
  });

  it('says why a taken item cannot be deleted yet', () => {
    expect(privateDeleteMessage(refusal('taken'))).toMatch(/^Its member can still take this back/);
    expect(privateDeleteMessage(refusal('frozen'))).toBeNull();
  });
});

describe('the accepted snapshot: a file or drawing an admin changed', () => {
  it('only a file or a drawing with changedByAdmin is shown as changed', () => {
    expect(acceptedBytesChanged({ type: 'file', changedByAdmin: true })).toBe(true);
    expect(acceptedBytesChanged({ type: 'draw', changedByAdmin: true })).toBe(true);
    expect(acceptedBytesChanged({ type: 'file', changedByAdmin: false })).toBe(false);
    expect(acceptedBytesChanged({ type: 'file' })).toBe(false);
    // Pages, notes and tables: the snapshot IS the text, nothing to hide.
    expect(acceptedBytesChanged({ type: 'page', changedByAdmin: true })).toBe(false);
    expect(acceptedBytesChanged({ type: 'table', changedByAdmin: true })).toBe(false);
  });

  it('names what changed', () => {
    expect(acceptedChangedText('file')).toMatch(/^An admin changed this file after accepting it/);
    expect(acceptedChangedText('draw')).toMatch(
      /^An admin changed this drawing after accepting it/,
    );
  });
});

describe('the take over and give back routes', () => {
  let calls: { method: string; url: string; body: unknown }[] = [];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      return new Response(JSON.stringify({ id: OWN, moved: [], returned: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Take over posts to the submission, with no body', async () => {
    await memberReview.takeOver(OWN);
    expect(calls).toEqual([
      { method: 'POST', url: `/api/team-admin/submissions/${OWN}/take-over`, body: undefined },
    ]);
  });

  it('Give back posts the note to the admin’s own item', async () => {
    await adminSpace.giveBack(OWN, 'Fix the totals.');
    expect(calls).toEqual([
      {
        method: 'POST',
        url: `/api/admin/space/${OWN}/give-back`,
        body: { note: 'Fix the totals.' },
      },
    ]);
  });
});
