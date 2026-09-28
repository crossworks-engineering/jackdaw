import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  TOP_OF_PAGES,
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
    expect(ui).toContain("parentPageId: item.type === 'page' && parentId !== TOP ? parentId : null,");
    expect(ui).toMatch(/value=\{parentId\}/);
    expect(ui).toMatch(/onClick=\{\(\) => void bundle\.refetch\(\)\}\s*>\s*Retry/);
    expect(ui).toContain('<Label id="review-level-label">Who can see it</Label>');
    expect(ui).toContain('aria-labelledby="review-level-label"');
  });
});
