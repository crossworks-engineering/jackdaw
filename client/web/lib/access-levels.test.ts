import { describe, expect, it } from 'vitest';
import type { AccessItemView } from '@mantle/client-types';
import {
  LEVEL_ORDER,
  closureAbove,
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

  it('lists the closure items above a level', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(closureAbove(closure, 'team').map((c) => c.id)).toEqual(['a']);
    expect(closureAbove(closure, 'public').map((c) => c.id)).toEqual(['a', 't']);
    expect(closureAbove(closure, 'admin')).toEqual([]);
  });

  it('refreshes the screens that show the item', () => {
    expect(queryKeysForType('page')).toEqual([['pages']]);
    expect(queryKeysForType('branch')).toEqual([['files']]);
    expect(queryKeysForType('formula')).toEqual([['formulas'], ['formula']]);
    expect(queryKeysForType('journal')).toEqual([]);
  });
});
