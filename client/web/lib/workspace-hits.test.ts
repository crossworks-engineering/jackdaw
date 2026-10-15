import { describe, expect, it } from 'vitest';
import {
  ELSEWHERE_MAX,
  elsewhereShown,
  elsewhereText,
  hitLabel,
  hitWorkspaceOf,
  switchFor,
} from './workspace-hits';

const team = { id: 't', name: 'Team' };
const admin = { id: 'a', name: 'Admin' };
const mine = { id: 'm', name: 'Mia (only you)', private: true as const };
const held = [team, admin, mine];

describe('switchFor', () => {
  it('switches to the hit’s workspace when another one is picked', () => {
    expect(switchFor({ workspace: { id: 'a', name: 'Admin' } }, 't', held)).toBe(admin);
  });

  it('never on All my workspaces, nor for a hit in the current workspace', () => {
    expect(switchFor({ workspace: { id: 'a', name: 'Admin' } }, null, held)).toBeNull();
    expect(switchFor({ workspace: { id: 't', name: 'Team' } }, 't', held)).toBeNull();
  });

  it('a brain that names no workspace: no tag, no switch', () => {
    expect(switchFor({}, 't', held)).toBeNull();
    expect(switchFor(null, 't', held)).toBeNull();
    expect(switchFor({ workspace: { id: 'a' } }, 't', held)).toBeNull();
    expect(hitWorkspaceOf({ workspace: 'a' })).toBeUndefined();
  });

  it('never to a workspace the login does not hold', () => {
    expect(switchFor({ workspace: { id: 'x', name: 'Other' } }, 't', held)).toBeNull();
  });
});

describe('the hint under an empty folder', () => {
  it('names the login’s other workspaces, most first, at most a few', () => {
    const more = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, name: `W${i}` }));
    const shown = elsewhereShown(
      [
        { id: 'a', name: 'Admin', count: 2 },
        { id: 't', name: 'Team', count: 9 },
        { id: 'x', name: 'Not held', count: 4 },
        { id: 'z', name: 'Zero', count: 0 },
        ...more.map((w) => ({ ...w, count: 1 })),
      ],
      't',
      [...held, ...more, { id: 'z', name: 'Zero' }],
    );
    expect(shown[0]).toEqual({ workspace: admin, count: 2 });
    expect(shown).toHaveLength(ELSEWHERE_MAX);
    expect(shown.map((s) => s.workspace.id)).not.toContain('t');
    expect(shown.map((s) => s.workspace.id)).not.toContain('x');
    expect(shown.map((s) => s.workspace.id)).not.toContain('z');
  });

  it('nothing on All my workspaces or from a brain that sends none', () => {
    expect(elsewhereShown([{ id: 'a', name: 'Admin', count: 2 }], null, held)).toEqual([]);
    expect(elsewhereShown(undefined, 't', held)).toEqual([]);
  });

  it('says how many and where, in the switcher’s words', () => {
    const noun = { one: 'page', many: 'pages' };
    expect(elsewhereText(2, noun, admin)).toBe('2 pages in Admin');
    expect(elsewhereText(1, noun, mine)).toBe('1 page in Only you');
    expect(hitLabel(mine)).toBe('Only you');
  });
});
