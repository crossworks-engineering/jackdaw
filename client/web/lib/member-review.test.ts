import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  TOP_OF_PAGES,
  authorRoleLabel,
  confirmLevelRefusal,
  defaultAcceptLevel,
  goingDownAt,
  goingDownLine,
  levelConfirmation,
  needsLevelConfirm,
  bundleSummary,
  reviewAssetPath,
  reviewErrorMessage,
  shownParent,
  splitQueue,
  type ReviewItemRow,
} from './member-review';

const S = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';
const D = '33333333-3333-4333-8333-333333333333';

describe('reviewAssetPath', () => {
  it('maps the brain asset routes onto the submission byte routes', () => {
    expect(reviewAssetPath(S, `/api/files/files/${F}`)).toBe(
      `/api/team-admin/submissions/${S}/bytes?node=${F}`,
    );
    expect(reviewAssetPath(S, `/api/files/files/${F}?raw=1&thumb=1`)).toBe(
      `/api/team-admin/submissions/${S}/bytes?node=${F}&thumb=1`,
    );
    expect(reviewAssetPath(S, `/api/draws/${D}/svg?raw=1`)).toBe(
      `/api/team-admin/submissions/${S}/svg?node=${D}`,
    );
    // The item itself needs no node.
    expect(reviewAssetPath(S, `/api/files/files/${S}`)).toBe(
      `/api/team-admin/submissions/${S}/bytes`,
    );
  });

  it('passes anything else through', () => {
    expect(reviewAssetPath(S, 'https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(reviewAssetPath(S, `/api/pages/${F}`)).toBe(`/api/pages/${F}`);
  });
});

describe('splitQueue and bundleSummary', () => {
  const row = (id: string, reason: ReviewItemRow['reason']) =>
    ({ id, reason }) as unknown as ReviewItemRow;

  it('splits waiting items from left-behind ones, keeping order', () => {
    const s = splitQueue([row('a', 'submitted'), row('b', 'left-behind'), row('c', 'submitted')]);
    expect(s.submitted.map((r) => r.id)).toEqual(['a', 'c']);
    expect(s.leftBehind.map((r) => r.id)).toEqual(['b']);
  });

  it('says what moves along with the item', () => {
    const item = { id: S, type: 'page' as const, title: 'Plan' };
    expect(bundleSummary([item])).toBe('Nothing else moves with it.');
    expect(
      bundleSummary([
        item,
        { id: F, type: 'file', title: 'a.png' },
        { id: D, type: 'file', title: 'b.png' },
        { id: 'x', type: 'draw', title: 'Sketch' },
      ]),
    ).toBe('Also moves 2 files, 1 drawing.');
  });
});

describe('reviewErrorMessage', () => {
  it('reads a 404 as "not waiting any more", never as "private"', () => {
    const msg = reviewErrorMessage(new ApiError('Not found.', 404, {}), 'x');
    expect(msg).toMatch(/not waiting for review/);
    expect(reviewErrorMessage(new ApiError('Pick a level.', 400, {}), 'x')).toBe('Pick a level.');
    expect(reviewErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it("shows Accept's confirm-level refusal in the brain's words (client logins C1)", () => {
    const words =
      'A client wrote this. At client level every client login reads it, and what it embeds goes down with it. Confirm that, or accept it at team.';
    const err = new ApiError(words, 409, { error: words, reason: 'confirm-level' });
    expect(reviewErrorMessage(err, 'Could not accept this item.')).toBe(words);
  });
});

describe('the accept dialog: the parent page', () => {
  const shown = [TOP_OF_PAGES, 'p1', 'p2'];

  it('keeps a picked parent while it is shown', () => {
    expect(shownParent('p2', shown)).toBe('p2');
    expect(shownParent(TOP_OF_PAGES, shown)).toBe(TOP_OF_PAGES);
  });

  it('drops a picked parent a new search hid, to the top of Pages', () => {
    expect(shownParent('p1', [TOP_OF_PAGES, 'p3'])).toBe(TOP_OF_PAGES);
    expect(shownParent('p1', [TOP_OF_PAGES])).toBe(TOP_OF_PAGES);
  });

  it('the dialog sends and shows that parent, retries a failed bundle, and names the level group', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const ui = readFileSync(
      fileURLToPath(new URL('../components/team-admin/review-dialogs.tsx', import.meta.url)),
      'utf8',
    );
    expect(ui).toContain(
      "parentPageId: item.type === 'page' && parentId !== TOP ? parentId : null,",
    );
    expect(ui).toMatch(/value=\{parentId\}/);
    expect(ui).toMatch(/onClick=\{\(\) => void bundle\.refetch\(\)\}\s*>\s*Retry/);
    expect(ui).toContain('<Label id="review-level-label">Who can see it</Label>');
    expect(ui).toContain('aria-labelledby="review-level-label"');
  });
});

describe("a client's item at client or public (audit A28)", () => {
  const item = (id: string, audience: 'admin' | 'team' | 'client' | 'public') => ({
    id,
    type: 'file',
    title: id,
    audience,
  });

  it('badges the author role where the brain sends it', () => {
    expect(authorRoleLabel('client')).toBe('Client');
    expect(authorRoleLabel('member')).toBe('Member');
    expect(authorRoleLabel(undefined)).toBeNull();
    expect(authorRoleLabel(null)).toBeNull();
  });

  it("starts a client's item at Team, anything else at Admin (unchanged)", () => {
    expect(defaultAcceptLevel('client')).toBe('team');
    expect(defaultAcceptLevel('member')).toBe('admin');
    expect(defaultAcceptLevel(undefined)).toBe('admin');
  });

  it('asks for ticks only for a client item at Client or Public', () => {
    expect(needsLevelConfirm('client', 'client')).toBe(true);
    expect(needsLevelConfirm('client', 'public')).toBe(true);
    expect(needsLevelConfirm('client', 'team')).toBe(false);
    expect(needsLevelConfirm('client', 'admin')).toBe(false);
    // A member's item: unchanged, never asked.
    for (const l of ['admin', 'team', 'client', 'public'] as const) {
      expect(needsLevelConfirm('member', l)).toBe(false);
      expect(needsLevelConfirm(undefined, l)).toBe(false);
    }
  });

  it('lists what goes down: the closure items above the level', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('c', 'client')];
    expect(goingDownAt(closure, 'client').map((i) => i.id)).toEqual(['a', 't']);
    expect(goingDownAt(closure, 'public').map((i) => i.id)).toEqual(['a', 't', 'c']);
    expect(goingDownAt(undefined, 'client')).toEqual([]);
  });

  it('confirms only once every item that goes down is ticked', () => {
    const down = [item('a', 'admin'), item('t', 'team')];
    expect(levelConfirmation(down, new Set(['a']))).toBeNull();
    expect(levelConfirmation(down, new Set(['a', 't', 'x']))).toEqual({
      lowerConfirmed: true,
      confirmedIds: ['a', 't'],
    });
    // Nothing goes down: the level itself is the confirmation.
    expect(levelConfirmation([], new Set())).toEqual({ lowerConfirmed: true, confirmedIds: [] });
  });

  it("reads the brain's 409 confirm-level, with its list when it sends one", () => {
    const down = [item('a', 'admin')];
    const withList = new ApiError('Confirm.', 409, {
      error: 'Confirm.',
      reason: 'confirm-level',
      goingDown: down,
    });
    expect(confirmLevelRefusal(withList)).toEqual({ message: 'Confirm.', goingDown: down });
    const bare = new ApiError('Confirm it.', 409, { reason: 'confirm-level' });
    expect(confirmLevelRefusal(bare)).toEqual({ message: 'Confirm it.', goingDown: null });
    expect(confirmLevelRefusal(new ApiError('x', 409, { reason: 'other' }))).toBeNull();
    expect(confirmLevelRefusal(new ApiError('x', 400, { reason: 'confirm-level' }))).toBeNull();
  });

  it('says who reads it and what goes down', () => {
    expect(goingDownLine('client', 2)).toBe(
      'A client wrote this. At Client, every client login reads it, and these 2 items it embeds go down with it. Tick each to confirm.',
    );
    expect(goingDownLine('public', 1)).toMatch(/anyone with the link reads it, and this item/);
    expect(goingDownLine('client', 0)).toBe(
      'A client wrote this. At Client, every client login reads it.',
    );
    expect(goingDownLine('client', null)).toMatch(/with what it embeds\. Tick to confirm\.$/);
  });
});
