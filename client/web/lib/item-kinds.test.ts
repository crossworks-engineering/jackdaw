import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as kinds from './item-kinds';

describe('item kinds', () => {
  it('names each kind in the owner words, and an unknown one as is', () => {
    expect(kinds.kindLabel('branch')).toBe('Folder');
    expect(kinds.kindLabel('draw')).toBe('Drawing');
    expect(kinds.kindLabel('journal')).toBe('journal');
  });

  it('refreshes the lists of the kind', () => {
    expect(kinds.queryKeysForType('page')).toEqual([['pages']]);
    expect(kinds.queryKeysForType('branch')).toEqual([['files']]);
    expect(kinds.queryKeysForType('formula')).toEqual([['formulas'], ['formula']]);
    expect(kinds.queryKeysForType('journal')).toEqual([]);
  });

  it('holds no access level any more (W8)', () => {
    expect(Object.keys(kinds).sort()).toEqual(['ITEM_KIND_LABEL', 'kindLabel', 'queryKeysForType']);
    const old = fileURLToPath(new URL('./access-levels.ts', import.meta.url));
    expect(existsSync(old)).toBe(false);
  });
});
