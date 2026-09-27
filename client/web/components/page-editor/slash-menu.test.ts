import { describe, expect, it } from 'vitest';
import { MEMBER_HIDDEN, getSlashItems } from './slash-menu';

describe('getSlashItems for a member', () => {
  it('hides the items that create or upload into the brain, by id', () => {
    const member = getSlashItems('', { member: true }).map((i) => i.id);
    for (const id of MEMBER_HIDDEN) expect(member).not.toContain(id);
    expect(member).toContain('text');
    expect(member).toContain('table');
    // Search does not bring them back either.
    for (const q of ['image', 'upload', 'draw', 'page', 'file']) {
      const ids = getSlashItems(q, { member: true }).map((i) => i.id);
      for (const id of MEMBER_HIDDEN) expect(ids, q).not.toContain(id);
    }
  });

  it('still hides them when their display titles change', () => {
    const all = getSlashItems('');
    const hidden = all.filter((i) => MEMBER_HIDDEN.has(i.id));
    expect(hidden.map((i) => i.id).sort()).toEqual(['drawing', 'file', 'image', 'sub-page']);
    const titles = hidden.map((i) => i.title);
    try {
      for (const i of hidden) i.title = `${i.title} (renamed)`;
      const member = getSlashItems('', { member: true }).map((i) => i.id);
      for (const id of MEMBER_HIDDEN) expect(member).not.toContain(id);
    } finally {
      hidden.forEach((i, n) => (i.title = titles[n]!));
    }
  });

  it('leaves the admin list whole', () => {
    const ids = getSlashItems('').map((i) => i.id);
    for (const id of MEMBER_HIDDEN) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
