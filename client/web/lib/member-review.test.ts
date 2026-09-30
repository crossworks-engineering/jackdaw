import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  acceptVisibilityRefusal,
  acceptedLine,
  authorRoleLabel,
  bundlePath,
  placeIsFor,
  placeShareLine,
  confirmLevelRefusal,
  defaultAcceptLevel,
  goingDownAt,
  goingDownLine,
  levelConfirmation,
  needsLevelConfirm,
  bundleSummary,
  reviewAssetPath,
  reviewErrorMessage,
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

describe('the accept dialog: where a page lands', () => {
  it('files a page like every tree kind (no parent page since folder phase 7)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const ui = readFileSync(
      fileURLToPath(new URL('../components/team-admin/review-dialogs.tsx', import.meta.url)),
      'utf8',
    );
    expect(ui).not.toContain('parentPageId');
    expect(ui).toContain('const filed = bundle.data?.place;');
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

describe('the accept dialog: a shared folder where it lands (folder plan phase 5)', () => {
  it('asks the preview for the admin’s pick, or the top level', () => {
    expect(bundlePath(S)).toBe(`/api/team-admin/submissions/${S}/bundle`);
    expect(bundlePath(S, F)).toBe(`/api/team-admin/submissions/${S}/bundle?folderId=${F}`);
    expect(bundlePath(S, null)).toBe(`/api/team-admin/submissions/${S}/bundle?folderId=root`);
  });

  it('trusts a preview place only for the pick it was asked for', () => {
    expect(placeIsFor({ folderId: F }, undefined)).toBe(true);
    expect(placeIsFor({ folderId: F }, { id: F })).toBe(true);
    expect(placeIsFor({ folderId: null }, null)).toBe(true);
    // A brain before the pick preview answers the filed place.
    expect(placeIsFor({ folderId: F }, { id: D })).toBe(false);
    expect(placeIsFor({ folderId: F }, null)).toBe(false);
  });

  it('says who reads everything in a shared folder', () => {
    expect(placeShareLine('client')).toBe('Clients read everything in this folder.');
    expect(placeShareLine('team')).toBe('The team reads everything in this folder.');
    expect(placeShareLine(null)).toBeNull();
    expect(placeShareLine(undefined)).toBeNull();
  });

  it('reads the brain’s 409 visibility, in the tree’s refusal shape', () => {
    const change = { id: F, title: 'Plan', from: 'admin', to: 'client' };
    const err = new ApiError('It lands in a shared folder', 409, {
      error: 'It lands in a shared folder',
      reason: 'visibility',
      changes: [change, { id: 1 }],
      total: 3,
    });
    expect(acceptVisibilityRefusal(err)).toEqual({
      error: 'visibility',
      changes: [change],
      total: 3,
    });
  });

  it('carries what the bundle embeds, with its kind', () => {
    const change = { id: F, title: 'Plan', from: 'admin', to: 'client' };
    const embed = { id: 'e', title: 'Prices', from: 'team', to: 'client', type: 'table' };
    const err = new ApiError('It lands in a shared folder', 409, {
      reason: 'visibility',
      changes: [change],
      total: 1,
      alsoEmbeds: [embed, { id: 2 }],
    });
    expect(acceptVisibilityRefusal(err)).toEqual({
      error: 'visibility',
      changes: [change],
      total: 1,
      alsoEmbeds: [embed],
    });
  });

  it('ignores the other refusals', () => {
    expect(
      acceptVisibilityRefusal(new ApiError('x', 409, { reason: 'confirm-level', goingDown: [] })),
    ).toBeNull();
    expect(acceptVisibilityRefusal(new ApiError('x', 404))).toBeNull();
    expect(acceptVisibilityRefusal(new Error('x'))).toBeNull();
  });

  it('toasts the level it is read at', () => {
    expect(acceptedLine('Plan', { audience: 'team', readAt: 'team' })).toBe(
      'Accepted “Plan” into the brain at Team.',
    );
    expect(acceptedLine('', { audience: 'admin', readAt: 'client' })).toBe(
      'Accepted “Untitled” into the brain at Admin. Its folder shares it, so it is read at Client.',
    );
    // A brain before readAt.
    expect(acceptedLine('Plan', { audience: 'client' })).toBe(
      'Accepted “Plan” into the brain at Client.',
    );
  });
});
