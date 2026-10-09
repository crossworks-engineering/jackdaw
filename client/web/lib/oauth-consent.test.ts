import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_RETURN_WINDOW_MS,
  oauthConsentNext,
  returnToConsent,
  type ConsentReturnDeps,
} from './oauth-consent';

const CONSENT =
  '/api/oauth/authorize?response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Fclient.example%2Fcb&code_challenge=' +
  'x'.repeat(43) +
  '&code_challenge_method=S256&state=s';

describe('oauthConsentNext', () => {
  it('keeps the consent page on this origin, its query whole', () => {
    expect(oauthConsentNext(CONSENT)).toBe(CONSENT);
    expect(oauthConsentNext('/api/oauth/authorize')).toBe('/api/oauth/authorize');
  });

  it('refuses every other path, /api ones included', () => {
    expect(oauthConsentNext('/')).toBeUndefined();
    expect(oauthConsentNext('/settings/mcp')).toBeUndefined();
    expect(oauthConsentNext('/api/oauth/token')).toBeUndefined();
    expect(oauthConsentNext('/api/oauth/authorizex')).toBeUndefined();
    expect(oauthConsentNext('/api/oauth/authorize/x')).toBeUndefined();
    // A dot segment resolves to another path before the test.
    expect(oauthConsentNext('/api/oauth/authorize/../token')).toBeUndefined();
    expect(oauthConsentNext(null)).toBeUndefined();
    expect(oauthConsentNext(undefined)).toBeUndefined();
  });

  it('refuses anything off this origin (no open redirect)', () => {
    expect(oauthConsentNext('https://evil.example/api/oauth/authorize')).toBeUndefined();
    expect(oauthConsentNext('//evil.example/api/oauth/authorize')).toBeUndefined();
    expect(oauthConsentNext('/\\evil.example/api/oauth/authorize')).toBeUndefined();
    expect(oauthConsentNext('/\n//evil.example/api/oauth/authorize')).toBeUndefined();
  });
});

function deps(over: Partial<ConsentReturnDeps> = {}) {
  const d = {
    crossOrigin: () => false,
    upgrade: vi.fn(async () => true),
    lastReturn: () => null,
    markReturn: vi.fn(),
    assign: vi.fn(),
    now: () => 1_000_000,
    ...over,
  };
  return d;
}

describe('returnToConsent', () => {
  it('turns the bearer into a cookie, then loads the consent page', async () => {
    const d = deps();
    expect(await returnToConsent(CONSENT, d)).toBe(true);
    expect(d.upgrade).toHaveBeenCalledOnce();
    expect(d.assign).toHaveBeenCalledWith(CONSENT);
    expect(d.markReturn).toHaveBeenCalledWith(1_000_000);
  });

  it('goes nowhere when the brain refuses the upgrade (a client, an old brain)', async () => {
    const d = deps({ upgrade: vi.fn(async () => false) });
    expect(await returnToConsent(CONSENT, d)).toBe(false);
    expect(d.assign).not.toHaveBeenCalled();
  });

  it('goes nowhere from a split client (the cookie would be on another origin)', async () => {
    const d = deps({ crossOrigin: () => true });
    expect(await returnToConsent(CONSENT, d)).toBe(false);
    expect(d.upgrade).not.toHaveBeenCalled();
    expect(d.assign).not.toHaveBeenCalled();
  });

  it('does not go back a second time moments later (the cookie did not stick: no loop)', async () => {
    const d = deps({ lastReturn: () => 1_000_000 - CONSENT_RETURN_WINDOW_MS + 1 });
    expect(await returnToConsent(CONSENT, d)).toBe(false);
    expect(d.upgrade).not.toHaveBeenCalled();
    expect(d.assign).not.toHaveBeenCalled();
    // Later than the window, it goes back again.
    const later = deps({ lastReturn: () => 1_000_000 - CONSENT_RETURN_WINDOW_MS });
    expect(await returnToConsent(CONSENT, later)).toBe(true);
  });
});
