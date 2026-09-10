import { describe, expect, it } from 'vitest';

import { assetTokenRefreshDelayMs, tokenExpEpoch } from './token-claims';

/**
 * The asset token rides in the URL, so the brain keeps its life short — two
 * hours. Nothing went back for a new one, so a tab left open past lunch got a
 * 401 on every image, iframe and download until someone reloaded.
 *
 * The delay is computed from the token's OWN `exp` rather than from a copy of
 * the brain's constant, so these pin the reading and the arithmetic — the two
 * places that decide whether the refresh lands before the expiry or after it.
 */

/** A token shaped like the brain's `signClaims` output: base64url payload, a
 *  dot, then a signature this side never looks at. */
function tokenWithExp(expEpochSeconds: number, { urlSafe = false } = {}): string {
  const json = JSON.stringify({ uid: 'u1', k: 'a', exp: expEpochSeconds });
  let payload = btoa(json);
  if (urlSafe) payload = payload.replace(/\+/g, '-').replace(/\//g, '_');
  return `${payload}.signature-we-never-verify`;
}

const NOW = 1_800_000_000_000; // a fixed "now" in ms
const TWO_HOURS_S = 2 * 60 * 60;

describe('tokenExpEpoch', () => {
  it('reads the expiry a token carries', () => {
    expect(tokenExpEpoch(tokenWithExp(1234567890))).toBe(1234567890);
  });

  it('decodes a base64URL payload, not just base64', () => {
    // The brain emits base64url, so `-` and `_` have to be mapped back before
    // atob or the parse throws and every token reads as unknown.
    const exp = 1234567890;
    const token = tokenWithExp(exp, { urlSafe: true });
    expect(tokenExpEpoch(token)).toBe(exp);
  });

  it('returns null for a token with no signature separator', () => {
    expect(tokenExpEpoch('not-a-token')).toBeNull();
  });

  it('returns null for a payload that is not JSON', () => {
    expect(tokenExpEpoch('bm90LWpzb24.sig')).toBeNull();
  });

  it('returns null when there is no exp, or it is the wrong type', () => {
    expect(tokenExpEpoch(`${btoa(JSON.stringify({ uid: 'u1' }))}.sig`)).toBeNull();
    expect(tokenExpEpoch(`${btoa(JSON.stringify({ exp: 'soon' }))}.sig`)).toBeNull();
  });

  it('never throws, whatever it is handed', () => {
    for (const junk of ['', '.', '..', 'a.b.c', '!!!.sig', btoa('{') + '.sig']) {
      expect(() => tokenExpEpoch(junk)).not.toThrow();
    }
  });
});

describe('assetTokenRefreshDelayMs', () => {
  it('does not poll at all when there is no token', () => {
    // The ordinary same-origin box: the session cookie authenticates assets and
    // no token is ever issued. Polling there would be a request per interval
    // for nothing.
    expect(assetTokenRefreshDelayMs(undefined, NOW)).toBe(false);
    expect(assetTokenRefreshDelayMs(null, NOW)).toBe(false);
    expect(assetTokenRefreshDelayMs('', NOW)).toBe(false);
  });

  it('refreshes a fresh two-hour token at the one-hour mark', () => {
    const token = tokenWithExp(NOW / 1000 + TWO_HOURS_S);
    expect(assetTokenRefreshDelayMs(token, NOW)).toBe(60 * 60_000);
  });

  it('leaves a whole half-life of margin, so one failed refresh is survivable', () => {
    // The point of halving rather than shaving: if the refresh at the halfway
    // mark fails — offline for a moment, a 500 — there is still an hour to try
    // again before anything starts 401ing.
    const token = tokenWithExp(NOW / 1000 + TWO_HOURS_S);
    const delay = assetTokenRefreshDelayMs(token, NOW) as number;
    expect(delay).toBeLessThan(TWO_HOURS_S * 1000);
    expect(TWO_HOURS_S * 1000 - delay).toBeGreaterThanOrEqual(delay);
  });

  it('halves whatever life is actually left, not the original TTL', () => {
    // A token collected 90 minutes ago has 30 left; the next check is in 15.
    const token = tokenWithExp(NOW / 1000 + 30 * 60);
    expect(assetTokenRefreshDelayMs(token, NOW)).toBe(15 * 60_000);
  });

  it('does not spin when the token is nearly or already expired', () => {
    // Both clamp to the floor rather than scheduling a refetch every few
    // milliseconds against a brain that may be the reason it is stale.
    const nearly = tokenWithExp(NOW / 1000 + 1);
    const expired = tokenWithExp(NOW / 1000 - 600);
    expect(assetTokenRefreshDelayMs(nearly, NOW)).toBe(30_000);
    expect(assetTokenRefreshDelayMs(expired, NOW)).toBe(30_000);
  });

  it('keeps refreshing when the expiry cannot be read, rather than giving up', () => {
    // An unreadable token means the format moved, not that there is nothing to
    // do. Returning false here would restore the exact bug this fixes — and
    // silently, because everything works until the TTL runs out.
    expect(assetTokenRefreshDelayMs('unreadable-token', NOW)).toBe(15 * 60_000);
    expect(assetTokenRefreshDelayMs('unreadable-token', NOW)).not.toBe(false);
  });

  it('always lands inside the token life it was given', () => {
    // The property that actually matters, over a spread of remaining lives:
    // the next refresh is scheduled BEFORE the thing expires.
    for (const remainingS of [30, 60, 300, 1800, 3600, TWO_HOURS_S, 6 * 3600]) {
      const delay = assetTokenRefreshDelayMs(tokenWithExp(NOW / 1000 + remainingS), NOW);
      expect(typeof delay).toBe('number');
      expect(delay as number).toBeLessThanOrEqual(remainingS * 1000);
    }
  });
});
