/**
 * A workspace's look (task 5edc9149): the picked colour and icon, else the
 * neutral colour and the default icon of its kind; an older brain's fields
 * stand in for the kind.
 */
import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_DEFAULT_ICONS,
  looksById,
  resolveWorkspaceLook,
  workspaceKindOf,
} from './workspace-look';
import { APP_ICONS } from '../components/app-nav/app-icons';

describe('resolveWorkspaceLook', () => {
  it('draws the picked colour and icon', () => {
    expect(resolveWorkspaceLook({ color: 'teal', icon: 'lucide:rocket', kind: 'other' })).toEqual({
      color: 'teal',
      icon: 'lucide:rocket',
      kind: 'other',
    });
  });

  it('nothing picked: the neutral colour and the icon of its kind', () => {
    for (const kind of ['admin', 'team', 'private', 'other'] as const) {
      expect(resolveWorkspaceLook({ color: null, icon: null, kind })).toEqual({
        color: null,
        icon: WORKSPACE_DEFAULT_ICONS[kind],
        kind,
      });
    }
  });

  it('a tint this client does not know is the neutral colour', () => {
    expect(resolveWorkspaceLook({ color: 'mauve' as never }).color).toBeNull();
  });

  it('every default icon is in the curated set', () => {
    for (const icon of Object.values(WORKSPACE_DEFAULT_ICONS)) {
      expect(APP_ICONS[icon.replace('lucide:', '')], icon).toBeDefined();
    }
  });
});

describe('workspaceKindOf', () => {
  it("the brain's kind, else an older brain's fields, else other", () => {
    expect(workspaceKindOf({ kind: 'team', isAdmin: true })).toBe('team');
    expect(workspaceKindOf({ isAdmin: true })).toBe('admin');
    expect(workspaceKindOf({ private: true })).toBe('private');
    expect(workspaceKindOf({})).toBe('other');
    expect(workspaceKindOf(null)).toBe('other');
  });
});

describe('looksById', () => {
  it('keys every list by id, a later list winning', () => {
    const m = looksById([{ id: 'a', color: 'red', icon: null }], undefined, [
      { id: 'a', color: 'teal', icon: 'lucide:rocket' },
      { id: 'b', color: null, icon: null, kind: 'team' },
    ]);
    expect(m.get('a')).toMatchObject({ color: 'teal', icon: 'lucide:rocket' });
    expect(m.get('b')?.kind).toBe('team');
    expect(m.get('c')).toBeUndefined();
  });
});
