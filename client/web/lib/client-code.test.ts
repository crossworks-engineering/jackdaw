import { describe, expect, it } from 'vitest';
import {
  CLIENT_CODE_NOT_VALID,
  CLIENT_CODE_RATE_LIMITED,
  CLIENT_CODE_SENT,
  CLIENT_CODE_TOO_MANY,
  clientCodeError,
  clientCodeRequestOutcome,
  clientCodeVerifyOutcome,
  clientCodesEnabled,
  normalizeClientCode,
} from './client-code';

/**
 * Email sign-in codes (client logins C2b), the pure half: whether a brain
 * sends codes, the ONE answer to asking for a code, what a verify answer
 * means, and the code check before it is sent.
 */
describe('clientCodesEnabled', () => {
  it('is a plain yes only', () => {
    expect(clientCodesEnabled(200, { enabled: true })).toBe(true);
    expect(clientCodesEnabled(200, { enabled: false })).toBe(false);
    expect(clientCodesEnabled(200, { enabled: 'true' })).toBe(false);
    expect(clientCodesEnabled(200, null)).toBe(false);
    // A brain before C2b, a refusal, a failure: no codes offered.
    expect(clientCodesEnabled(404, { enabled: true })).toBe(false);
    expect(clientCodesEnabled(403, { enabled: true })).toBe(false);
    expect(clientCodesEnabled(500, { enabled: true })).toBe(false);
  });
});

describe('clientCodeRequestOutcome', () => {
  it('every 2xx is the same one "sent", which names nobody', () => {
    const sent = { kind: 'sent', message: CLIENT_CODE_SENT };
    for (const status of [200, 201, 202, 204]) {
      expect(clientCodeRequestOutcome(status)).toEqual(sent);
    }
    // Conditional, never a confirmation that this email is a client.
    expect(CLIENT_CODE_SENT).toBe(
      'If this email has a client login, we sent it a code. It works for 10 minutes, in this browser.',
    );
  });

  it('a rate limit has its own sentence; anything else asks to try again', () => {
    expect(clientCodeRequestOutcome(429)).toEqual({
      kind: 'error',
      message: CLIENT_CODE_RATE_LIMITED,
    });
    expect(clientCodeRequestOutcome(500)).toEqual({
      kind: 'error',
      message: 'Could not ask for a code. Try again.',
    });
    expect(clientCodeRequestOutcome(0).kind).toBe('error');
  });
});

describe('clientCodeVerifyOutcome', () => {
  it('signs in only on a 2xx that says ok', () => {
    expect(clientCodeVerifyOutcome(200, { ok: true })).toEqual({ kind: 'ok' });
    expect(clientCodeVerifyOutcome(200, {}).kind).toBe('error');
    expect(clientCodeVerifyOutcome(200, null).kind).toBe('error');
  });

  it('a 401 is one sentence: the brain’s, else ours', () => {
    expect(
      clientCodeVerifyOutcome(401, { error: 'That code did not work. Ask for a new one.' }),
    ).toEqual({ kind: 'not-valid', message: 'That code did not work. Ask for a new one.' });
    expect(clientCodeVerifyOutcome(401, { error: '  ' })).toEqual({
      kind: 'not-valid',
      message: CLIENT_CODE_NOT_VALID,
    });
    expect(clientCodeVerifyOutcome(401, null)).toEqual({
      kind: 'not-valid',
      message: CLIENT_CODE_NOT_VALID,
    });
  });

  it('too many tries, and anything else', () => {
    expect(clientCodeVerifyOutcome(429, { error: 'Too many attempts.' })).toEqual({
      kind: 'error',
      message: CLIENT_CODE_TOO_MANY,
    });
    expect(clientCodeVerifyOutcome(500, { error: 'db down' })).toEqual({
      kind: 'error',
      message: 'Could not sign you in. Try again.',
    });
  });
});

describe('the code as typed', () => {
  it('spaces and a dash come out, pasted or typed', () => {
    expect(normalizeClientCode(' 1234 5678 ')).toBe('12345678');
    expect(normalizeClientCode('1234-5678')).toBe('12345678');
    expect(normalizeClientCode('\t12 34\n56 78')).toBe('12345678');
    expect(normalizeClientCode('01234567')).toBe('01234567');
  });

  it('goes only as 8 digits', () => {
    expect(clientCodeError('')).toBe('Enter the 8-digit code from the email.');
    expect(clientCodeError('   ')).toBe('Enter the 8-digit code from the email.');
    for (const bad of ['1234567', '123456789', '1234567a', 'abcdefgh', '1234.5678']) {
      expect(clientCodeError(bad), bad).toBe('The code is 8 digits.');
    }
    for (const good of ['12345678', ' 1234 5678 ', '1234-5678', '00000000']) {
      expect(clientCodeError(good), good).toBeNull();
    }
  });
});
