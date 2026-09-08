import { describe, expect, it } from 'vitest';
import { oneOf, readStored } from './use-persisted-state';

/**
 * The pure core of the persisted-preference hook. The hook itself is three
 * lines of React around this; what can actually be wrong is the decision about
 * what a stored string means, and that needs no DOM to pin.
 */

describe('readStored', () => {
  const parseView = oneOf('list', 'grid', 'dual');

  it('takes a recognised stored value', () => {
    expect(readStored('grid', parseView, 'list')).toBe('grid');
    expect(readStored('dual', parseView, 'list')).toBe('dual');
  });

  it('falls back when nothing is stored', () => {
    expect(readStored(null, parseView, 'list')).toBe('list');
  });

  // A value written by an older build, or edited by hand, must not become the
  // view. The old code did `stored === 'grid' ? 'grid' : …'list'`, which had
  // this property by accident; here it is the contract.
  it('falls back on a value it does not recognise', () => {
    expect(readStored('tiles', parseView, 'list')).toBe('list');
    expect(readStored('', parseView, 'list')).toBe('list');
    expect(readStored('GRID', parseView, 'list')).toBe('list');
  });

  it('carries a non-string preference through its own parser', () => {
    const parseWidth = (s: string): number | null => {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    expect(readStored('320', parseWidth, 240)).toBe(320);
    expect(readStored('-1', parseWidth, 240)).toBe(240);
    expect(readStored('wide', parseWidth, 240)).toBe(240);
  });
});

describe('oneOf', () => {
  it('accepts exactly its members', () => {
    const parse = oneOf('a', 'b');
    expect(parse('a')).toBe('a');
    expect(parse('b')).toBe('b');
    expect(parse('c')).toBeNull();
  });
});
