import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  UNEXPECTED_RESPONSE,
  UNREACHABLE,
  readBearer,
  settleWithin,
  signInErrorMessage,
} from './sign-in-error';

/**
 * Sign-in is the one screen with no transport to fall back on, so every failure
 * it can meet has to end in something the user can read. The bug these cover is
 * the silent one: the form re-enabling with nothing shown, which is
 * indistinguishable from a click that did not register.
 */

describe('signInErrorMessage', () => {
  it('explains a transport failure, which is what a rejected fetch is', () => {
    // `fetch` rejects with TypeError for offline, DNS, refused connections AND
    // CORS — the browser makes them one opaque error on purpose.
    expect(signInErrorMessage(new TypeError('Failed to fetch'))).toBe(UNREACHABLE);
  });

  it('does not guess which transport failure it was', () => {
    // A missing origin in the brain's CORS allowlist looks exactly like being
    // offline. Naming one would send the user after the wrong problem.
    expect(signInErrorMessage(new TypeError('NetworkError when attempting to fetch'))).toBe(
      UNREACHABLE,
    );
  });

  it('reads a request given up on (the sign-in timeout) as unreachable', () => {
    expect(signInErrorMessage(new DOMException('signal timed out', 'TimeoutError'))).toBe(
      UNREACHABLE,
    );
    expect(signInErrorMessage(new DOMException('aborted', 'AbortError'))).toBe(UNREACHABLE);
  });

  it('passes through a real error message, which beats a generic one', () => {
    expect(signInErrorMessage(new Error('Account is locked'))).toBe('Account is locked');
  });

  it('falls back when an Error carries no message', () => {
    expect(signInErrorMessage(new Error(''))).toBe('Sign-in failed. Please try again.');
    expect(signInErrorMessage(new Error('   '))).toBe('Sign-in failed. Please try again.');
  });

  it('handles a thrown non-Error, because anything can be thrown', () => {
    expect(signInErrorMessage('nope')).toBe('Sign-in failed. Please try again.');
    expect(signInErrorMessage(undefined)).toBe('Sign-in failed. Please try again.');
    expect(signInErrorMessage(null)).toBe('Sign-in failed. Please try again.');
  });

  it('always returns something to show — never an empty string', () => {
    for (const thrown of [new TypeError('x'), new Error('y'), 'z', null, undefined, 0, {}]) {
      expect(signInErrorMessage(thrown).trim()).not.toBe('');
    }
  });
});

describe('readBearer', () => {
  const body = (value: unknown) => ({ json: async () => value });
  const throws = (err: unknown) => ({
    json: async () => {
      throw err;
    },
  });

  it('reads the bearer from a well-formed response', async () => {
    await expect(readBearer(body({ token: 'abc123' }))).resolves.toBe('abc123');
  });

  it('rejects a 200 that is not JSON at all', async () => {
    // A captive portal, a proxy error page, or an HTML 200 from a misrouted
    // path. `res.json()` rejects, and before this the rejection escaped the
    // handler entirely.
    await expect(readBearer(throws(new SyntaxError('Unexpected token <')))).resolves.toBeNull();
  });

  it('rejects JSON that simply has no token', async () => {
    // `as { token: string }` was a lie the compiler could not catch: undefined
    // went into the token store, then to a signed-in shell where all 401s.
    await expect(readBearer(body({}))).resolves.toBeNull();
    await expect(readBearer(body({ ok: true }))).resolves.toBeNull();
  });

  it('rejects an empty or whitespace token, which fails the same way', async () => {
    await expect(readBearer(body({ token: '' }))).resolves.toBeNull();
    await expect(readBearer(body({ token: '   ' }))).resolves.toBeNull();
  });

  it('rejects a token of the wrong type', async () => {
    await expect(readBearer(body({ token: 12345 }))).resolves.toBeNull();
    await expect(readBearer(body({ token: null }))).resolves.toBeNull();
    await expect(readBearer(body({ token: { value: 'x' } }))).resolves.toBeNull();
  });

  it('survives a body that is not an object', async () => {
    await expect(readBearer(body(null))).resolves.toBeNull();
    await expect(readBearer(body('a string'))).resolves.toBeNull();
    await expect(readBearer(body([]))).resolves.toBeNull();
  });

  it('trims the token it returns', async () => {
    // A trailing newline from a hand-rolled proxy would otherwise ride into
    // every Authorization header.
    await expect(readBearer(body({ token: '  abc123\n' }))).resolves.toBe('abc123');
  });

  it('never throws, whatever the response does', async () => {
    for (const thrown of [new SyntaxError('bad'), 'string', null, undefined]) {
      await expect(readBearer(throws(thrown))).resolves.toBeNull();
    }
  });

  it('and the two failure messages are distinct, so the screen is not ambiguous', () => {
    expect(UNEXPECTED_RESPONSE).not.toBe(UNREACHABLE);
  });
});

/**
 * The steps after the bearer is held (same-origin cookie check and upgrade) are
 * best effort; a hang in any of them kept the Sign in button disabled.
 */
describe('settleWithin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers with the work when it finishes in time', async () => {
    await expect(settleWithin(Promise.resolve('client'), 1000, 'unknown')).resolves.toBe('client');
  });

  it('answers with the fallback when the work rejects', async () => {
    await expect(settleWithin(Promise.reject(new Error('x')), 1000, 'unknown')).resolves.toBe(
      'unknown',
    );
  });

  it('answers with the fallback when the work never settles', async () => {
    vi.useFakeTimers();
    const settled = settleWithin(new Promise<string>(() => undefined), 20_000, 'unknown');
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(settled).resolves.toBe('unknown');
  });
});
