import { describe, expect, it } from 'vitest';
import { MEMBER_ITEM_KINDS, MEMBER_KIND, MEMBER_KIND_PATHS } from './member-kinds';
import { mayOpenPath } from './workspaces';

describe('the one member kind map (audit M2)', () => {
  it('covers the brain’s kinds, each with its own screen', () => {
    expect(Object.keys(MEMBER_KIND).sort()).toEqual([...MEMBER_ITEM_KINDS].sort());
    expect(MEMBER_KIND_PATHS).toEqual(['/pages', '/notes', '/draw', '/tables', '/files']);
    expect(new Set(MEMBER_KIND_PATHS).size).toBe(MEMBER_KIND_PATHS.length);
  });

  it('every login may open every kind’s screen, Apps and the item permalink (W5c)', () => {
    for (const p of [...MEMBER_KIND_PATHS, '/apps', '/n']) {
      expect(mayOpenPath([], p)).toBe(true);
      expect(mayOpenPath([], `${p}/x`)).toBe(true);
    }
    expect(mayOpenPath([], '/nodes/x/history')).toBe(false);
  });
});
