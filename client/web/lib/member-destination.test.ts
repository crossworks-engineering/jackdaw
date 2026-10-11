import { describe, expect, it } from 'vitest';
import { destinationAfterSignIn } from './member-destination';
import { OAUTH_CONSENT_PATH } from './oauth-consent';

/**
 * Where sign-in lands (phase W5c): every login lands in the same shell, so
 * no shell is asked first. The MCP consent page wins; otherwise `next`, else
 * the home.
 */
describe('destinationAfterSignIn', () => {
  it('goes where the login was headed, else home', async () => {
    expect(await destinationAfterSignIn('/settings')).toBe('/settings');
    expect(await destinationAfterSignIn('/pages/abc?x=1')).toBe('/pages/abc?x=1');
    expect(await destinationAfterSignIn(null)).toBe('/');
    expect(await destinationAfterSignIn(undefined)).toBe('/');
  });

  it('keeps the MCP consent page, its query whole', async () => {
    const next = `${OAUTH_CONSENT_PATH}?client_id=c1&state=s`;
    expect(await destinationAfterSignIn(next)).toBe(next);
  });
});
