import { describe, expect, it } from 'vitest';
import type { AccessItemView } from '@mantle/client-types';
import {
  AUDIENCE_TITLE,
  LEVEL_MEANING,
  LEVEL_ORDER,
  alsoLoweredOf,
  closureAbove,
  closureBelow,
  embedsFollowIn,
  embedsSharedWith,
  isAbove,
  isAccessLevel,
  queryKeysForType,
  showsLink,
} from './access-levels';

const item = (id: string, audience: AccessItemView['audience']): AccessItemView => ({
  id,
  type: 'file',
  title: id,
  audience,
});

describe('access levels', () => {
  it('orders admin > team > client > public', () => {
    expect(LEVEL_ORDER).toEqual(['admin', 'team', 'client', 'public']);
    for (let i = 0; i < LEVEL_ORDER.length - 1; i++) {
      expect(isAbove(LEVEL_ORDER[i]!, LEVEL_ORDER[i + 1]!)).toBe(true);
      expect(isAbove(LEVEL_ORDER[i + 1]!, LEVEL_ORDER[i]!)).toBe(false);
    }
    expect(isAbove('team', 'team')).toBe(false);
  });

  it('recognises only the four levels', () => {
    expect(isAccessLevel('client')).toBe(true);
    expect(isAccessLevel('everyone')).toBe(false);
    expect(isAccessLevel(undefined)).toBe(false);
  });

  it('shows a link only at client and public', () => {
    expect(LEVEL_ORDER.filter(showsLink)).toEqual(['client', 'public']);
  });

  it('says a team item reaches members by their logins, not a link or the old workspace', () => {
    // Team links and the team-code workspace are retired (member logins
    // Phase 6 stage 6): members read a team item by level.
    for (const text of [LEVEL_MEANING.team, AUDIENCE_TITLE.team]) {
      expect(text).toMatch(/members/i);
      expect(text).toMatch(/logins/);
      expect(text).not.toMatch(/workspace|team-only|anyone with the link/i);
    }
  });

  it('lists the closure items above a level', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(closureAbove(closure, 'team').map((c) => c.id)).toEqual(['a']);
    expect(closureAbove(closure, 'public').map((c) => c.id)).toEqual(['a', 't']);
    expect(closureAbove(closure, 'admin')).toEqual([]);
  });

  it('lists the closure items below a level (MED 7)', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(closureBelow(closure, 'admin').map((c) => c.id)).toEqual(['t', 'p']);
    expect(closureBelow(closure, 'team').map((c) => c.id)).toEqual(['p']);
    expect(closureBelow(closure, 'public')).toEqual([]);
  });

  it('refreshes the screens that show the item', () => {
    expect(queryKeysForType('page')).toEqual([['pages']]);
    expect(queryKeysForType('branch')).toEqual([['files']]);
    expect(queryKeysForType('formula')).toEqual([['formulas'], ['formula']]);
    expect(queryKeysForType('journal')).toEqual([]);
  });

  it('says what lowering will also share, only where the brain lowers embeds', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(embedsSharedWith(true, closure, 'public').map((c) => c.id)).toEqual(['a', 't']);
    expect(embedsSharedWith(true, closure, 'team').map((c) => c.id)).toEqual(['a']);
    // Raising shares nothing.
    expect(embedsSharedWith(true, closure, 'admin')).toEqual([]);
    // A folder's contents do not follow it, and an older brain does not lower them.
    expect(embedsSharedWith(false, closure, 'public')).toEqual([]);
  });

  it('reads whether embeds follow from the brain, absent meaning an older brain', () => {
    expect(embedsFollowIn({ embedsFollow: true })).toBe(true);
    expect(embedsFollowIn({ embedsFollow: false })).toBe(false);
    expect(embedsFollowIn({})).toBe(false);
  });

  it('reads what the brain lowered, or null from a brain that does not say', () => {
    const l = { id: 'f', type: 'file', title: 'f', from: 'admin', to: 'public' } as const;
    expect(alsoLoweredOf({ alsoLowered: [l] })).toEqual([l]);
    expect(alsoLoweredOf({ alsoLowered: [] })).toEqual([]);
    expect(alsoLoweredOf({ lowered: [] })).toBeNull();
  });
});
