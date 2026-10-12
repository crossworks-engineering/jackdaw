import { describe, expect, it } from 'vitest';
import { childPageHref, childPageLivePath } from './child-page-card';

/** W6b: every login reads the page route in its own scope and opens /pages;
 *  a role not known yet keeps the snapshot and links nowhere. */
describe('a sub-page card', () => {
  it('reads the live title for every known role, id encoded', () => {
    for (const role of ['admin', 'member'] as const) {
      expect(childPageLivePath(role, 'p-1')).toBe('/api/pages/p-1');
    }
    expect(childPageLivePath('member', '../chat')).toBe('/api/pages/..%2Fchat');
  });

  it('keeps the snapshot for an unknown role or no page', () => {
    expect(childPageLivePath(null, 'p-1')).toBeNull();
    expect(childPageLivePath('admin', null)).toBeNull();
  });

  it('links for every known role, never for an unknown one', () => {
    for (const role of ['admin', 'member'] as const) {
      expect(childPageHref(role, 'p-1')).toBe('/pages/p-1');
    }
    expect(childPageHref(null, 'p-1')).toBeNull();
    expect(childPageHref('admin', null)).toBeNull();
  });
});
