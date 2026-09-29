import { describe, expect, it } from 'vitest';
import { searchBoxOnUrl } from './url-search-box';

/**
 * The search box follows the URL (audit U9): Back after a search empties
 * the box instead of pushing the old words again; the box's own push
 * arriving leaves what was typed since.
 */
describe('searchBoxOnUrl', () => {
  it('follows the URL when it moved some other way (Back, Forward, a link)', () => {
    // Searched "door", then Back: the URL has no q, the box pushed nothing new.
    expect(searchBoxOnUrl('', null)).toEqual({ follow: true });
    // Forward again, to q=door.
    expect(searchBoxOnUrl('door', null)).toEqual({ follow: true });
    // The box pushed "door", and the URL moved to something else.
    expect(searchBoxOnUrl('gate', 'door')).toEqual({ follow: true });
  });

  it('leaves the box alone when the URL answers with its own push', () => {
    expect(searchBoxOnUrl('door', 'door')).toEqual({ follow: false });
    expect(searchBoxOnUrl('', '')).toEqual({ follow: false });
  });
});
