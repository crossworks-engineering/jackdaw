import { describe, expect, it } from 'vitest';
import { childPageHref, childPageLivePath } from './child-page-card';

/** Client tier audit U3: a sub-page card asks the admin route for an admin
 *  only, and a client's card links nowhere. */
describe('child page card', () => {
  it('reads the live title for a confirmed admin, id encoded', () => {
    expect(childPageLivePath('admin', 'p-1')).toBe('/api/pages/p-1');
    expect(childPageLivePath('admin', '../chat')).toBe('/api/pages/..%2Fchat');
  });

  it('keeps the snapshot for a member, a client and an unknown role', () => {
    for (const role of ['member', 'client', null] as const) {
      expect(childPageLivePath(role, 'p-1')).toBeNull();
    }
    expect(childPageLivePath('admin', null)).toBeNull();
  });

  it('links for an admin and a member, never for a client or an unknown role', () => {
    expect(childPageHref('admin', 'p-1')).toBe('/pages/p-1');
    expect(childPageHref('member', 'a/b')).toBe('/pages/a%2Fb');
    expect(childPageHref('client', 'p-1')).toBeNull();
    expect(childPageHref(null, 'p-1')).toBeNull();
  });
});
