import { describe, expect, it } from 'vitest';
import { MEMBER_ITEM_KINDS, MEMBER_KIND, MEMBER_KIND_PATHS } from './member-kinds';
import { MEMBER_NAV } from './member-nav';
import { MEMBER_APP_PREFIXES, memberMayOpen } from './member-surface';
import { bundleSummary } from './member-review';

describe('the one member kind map (audit M2)', () => {
  it('covers the brain’s kinds, each with its own screen', () => {
    expect(Object.keys(MEMBER_KIND).sort()).toEqual([...MEMBER_ITEM_KINDS].sort());
    expect(MEMBER_KIND_PATHS).toEqual(['/pages', '/notes', '/draw', '/tables', '/files']);
    expect(new Set(MEMBER_KIND_PATHS).size).toBe(MEMBER_KIND_PATHS.length);
  });

  it('the route guard and the nav reach every kind’s screen, and Apps', () => {
    expect([...MEMBER_APP_PREFIXES]).toEqual([...MEMBER_KIND_PATHS, '/apps']);
    for (const p of MEMBER_KIND_PATHS) expect(memberMayOpen(`${p}/x`)).toBe(true);
    const workspace = MEMBER_NAV.find((g) => g.label === 'Workspace')!.items;
    expect(workspace.map((i) => [i.name, i.href])).toEqual([
      ['Pages', '/pages'],
      ['Notes', '/notes'],
      ['Draw', '/draw'],
      ['Tables', '/tables'],
      ['Files', '/files'],
      ['Apps', '/apps'],
    ]);
    expect(new Set(workspace.map((i) => i.icon)).size).toBe(workspace.length);
  });

  it('the review dialog counts in the map’s words', () => {
    expect(
      bundleSummary([
        { id: '1', type: 'page', title: 'p' },
        { id: '2', type: 'draw', title: 'a' },
        { id: '3', type: 'draw', title: 'b' },
        { id: '4', type: 'file', title: 'f' },
      ]),
    ).toBe('Also moves 2 drawings, 1 file.');
  });
});
