import { describe, expect, it } from 'vitest';

import { UNEXPECTED_RESPONSE, UNREACHABLE, readBearer, signInErrorMessage } from './sign-in-error';

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
