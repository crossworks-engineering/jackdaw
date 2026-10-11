import { describe, expect, it } from 'vitest';
import {
  EMAIL_CODE_NOT_VALID,
  EMAIL_CODE_RATE_LIMITED,
  EMAIL_CODE_SENT,
  EMAIL_CODE_TOO_MANY,
  emailCodeError,
  emailCodeRequestOutcome,
  emailCodeVerifyOutcome,
  emailCodesEnabled,
  normalizeEmailCode,
  emailAddressError,
  offersEmailCode,
  EMAIL_CODE_PATH,
  EMAIL_CODE_VERIFY_PATH,
} from './email-code';

/**
 * Sign-in by email code, the pure half: whether a brain sends codes, when
 * the sign-in page offers them, the ONE answer to asking for a code, what a
 * verify answer means, and the checks before anything is sent.
 */
describe('emailCodesEnabled', () => {
  it('is a plain yes only', () => {
    expect(emailCodesEnabled(200, { enabled: true })).toBe(true);
    expect(emailCodesEnabled(200, { enabled: false })).toBe(false);
    expect(emailCodesEnabled(200, { enabled: 'true' })).toBe(false);
    expect(emailCodesEnabled(200, null)).toBe(false);
    // A brain without the route, a refusal, a failure: no codes offered.
    expect(emailCodesEnabled(404, { enabled: true })).toBe(false);
    expect(emailCodesEnabled(403, { enabled: true })).toBe(false);
    expect(emailCodesEnabled(500, { enabled: true })).toBe(false);
  });
});

describe('emailCodeRequestOutcome', () => {
  it('every 2xx is the same one "sent", which names nobody', () => {
    const sent = { kind: 'sent', message: EMAIL_CODE_SENT };
    for (const status of [200, 201, 202, 204]) {
      expect(emailCodeRequestOutcome(status)).toEqual(sent);
    }
    // Conditional, never a confirmation that this email has a login, and
    // naming no kind of login.
    expect(EMAIL_CODE_SENT).toBe(
      'If this email has a client login, we sent it a code. It works for 10 minutes, in this browser.',
    );
  });

  it('a rate limit has its own sentence; anything else asks to try again', () => {
    expect(emailCodeRequestOutcome(429)).toEqual({
      kind: 'error',
      message: EMAIL_CODE_RATE_LIMITED,
    });
    expect(emailCodeRequestOutcome(500)).toEqual({
      kind: 'error',
      message: 'Could not ask for a code. Try again.',
    });
    expect(emailCodeRequestOutcome(0).kind).toBe('error');
  });
});

describe('emailCodeVerifyOutcome', () => {
  it('signs in only on a 2xx that says ok', () => {
    expect(emailCodeVerifyOutcome(200, { ok: true })).toEqual({ kind: 'ok' });
    expect(emailCodeVerifyOutcome(200, {}).kind).toBe('error');
    expect(emailCodeVerifyOutcome(200, null).kind).toBe('error');
  });

  it('a 401 is one sentence: the brain’s, else ours', () => {
    expect(
      emailCodeVerifyOutcome(401, { error: 'That code did not work. Ask for a new one.' }),
    ).toEqual({ kind: 'not-valid', message: 'That code did not work. Ask for a new one.' });
    expect(emailCodeVerifyOutcome(401, { error: '  ' })).toEqual({
      kind: 'not-valid',
      message: EMAIL_CODE_NOT_VALID,
    });
    expect(emailCodeVerifyOutcome(401, null)).toEqual({
      kind: 'not-valid',
      message: EMAIL_CODE_NOT_VALID,
    });
  });

  it('too many tries, and anything else', () => {
    expect(emailCodeVerifyOutcome(429, { error: 'Too many attempts.' })).toEqual({
      kind: 'error',
      message: EMAIL_CODE_TOO_MANY,
    });
    expect(emailCodeVerifyOutcome(500, { error: 'db down' })).toEqual({
      kind: 'error',
      message: 'Could not sign you in. Try again.',
    });
  });
});

describe('the code as typed', () => {
  it('spaces and a dash come out, pasted or typed', () => {
    expect(normalizeEmailCode(' 1234 5678 ')).toBe('12345678');
    expect(normalizeEmailCode('1234-5678')).toBe('12345678');
    expect(normalizeEmailCode('\t12 34\n56 78')).toBe('12345678');
    expect(normalizeEmailCode('01234567')).toBe('01234567');
  });

  it('goes only as 8 digits', () => {
    expect(emailCodeError('')).toBe('Enter the 8-digit code from the email.');
    expect(emailCodeError('   ')).toBe('Enter the 8-digit code from the email.');
    for (const bad of ['1234567', '123456789', '1234567a', 'abcdefgh', '1234.5678']) {
      expect(emailCodeError(bad), bad).toBe('The code is 8 digits.');
    }
    for (const good of ['12345678', ' 1234 5678 ', '1234-5678', '00000000']) {
      expect(emailCodeError(good), good).toBeNull();
    }
  });
});

describe('where the code is offered', () => {
  const base = { enabled: true, firstRun: false, add: false, crossOrigin: false };

  it('on the sign-in page when the brain sends codes', () => {
    expect(offersEmailCode(base)).toBe(true);
    expect(offersEmailCode({ ...base, enabled: false })).toBe(false);
  });

  it('not on the first run, not while adding a login, not from another origin', () => {
    expect(offersEmailCode({ ...base, firstRun: true })).toBe(false);
    expect(offersEmailCode({ ...base, add: true })).toBe(false);
    expect(offersEmailCode({ ...base, crossOrigin: true })).toBe(false);
  });

  it('asks the routes it always asked, named in one place', () => {
    expect(EMAIL_CODE_PATH).toBe('/api/auth/client-code');
    expect(EMAIL_CODE_VERIFY_PATH).toBe('/api/auth/client-code/verify');
  });
});

describe('the email before a code is asked for', () => {
  it('is needed, and must look like an email', () => {
    expect(emailAddressError('')).toBe('Enter your email address.');
    expect(emailAddressError('  ')).toBe('Enter your email address.');
    expect(emailAddressError('pat')).toBe('That does not look like an email address.');
    expect(emailAddressError(' pat@example.invalid ')).toBeNull();
  });
});
