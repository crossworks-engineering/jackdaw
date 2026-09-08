import { describe, expect, it } from 'vitest';
import { MIN_QUERY, fileHitsOnly, isSearchActive, searchUrl } from './use-file-search';
import type { FileSearchHit } from './files-shared';

/** The pure decisions inside the left pane's search. The hook around them is
 *  a debounce and a generation counter; what can be wrong is the rules. */

describe('isSearchActive', () => {
  it('needs two real characters', () => {
    expect(isSearchActive('a')).toBe(false);
    expect(isSearchActive('ab')).toBe(true);
    expect(MIN_QUERY).toBe(2);
  });

  // A space is not a search, and the input keeps whatever was typed — so the
  // decision has to trim even though the value does not.
  it('does not count whitespace', () => {
    expect(isSearchActive('   ')).toBe(false);
    expect(isSearchActive(' a ')).toBe(false);
    expect(isSearchActive(' ab ')).toBe(true);
    expect(isSearchActive('')).toBe(false);
  });
});

describe('searchUrl', () => {
  it('searches the files branch, trimmed and encoded', () => {
    const url = searchUrl('  quarterly report  ');
    expect(url).toContain('q=quarterly%20report');
    expect(url).toContain('branch=files');
  });

  it('encodes what would otherwise change the query string', () => {
    expect(searchUrl('a&b=c')).toContain('q=a%26b%3Dc');
    expect(searchUrl('100%')).toContain('q=100%25');
  });
});

describe('fileHitsOnly', () => {
  const hit = (type: string, id: string) => ({ type, id }) as unknown as FileSearchHit;

  // Folders reach the user through the filtered tree; showing them again in
  // the results list was the duplicate this filter exists to stop.
  it('drops everything that is not a file', () => {
    const out = fileHitsOnly([hit('file', 'a'), hit('folder', 'b'), hit('file', 'c')]);
    expect(out.map((h) => h.id)).toEqual(['a', 'c']);
  });

  it('survives an empty result set', () => {
    expect(fileHitsOnly([])).toEqual([]);
  });
});
