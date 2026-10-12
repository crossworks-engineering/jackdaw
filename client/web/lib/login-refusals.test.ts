import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  CONTACT_WAS_CLIENT_TEXT,
  EMAIL_WAS_CLIENT_TEXT,
  FORMER_CLIENT_ENABLE_TEXT,
  formerClientText,
  loginRefusalText,
  refusalReason,
} from './login-refusals';

const refused = (reason: string | undefined, error = 'brain words', status = 409) =>
  new ApiError(error, status, { error, ...(reason ? { reason } : {}) });

describe('the former client refusals (W8), in plain words', () => {
  it('enabling a former client login', () => {
    expect(loginRefusalText(refused('former-client'), 'x')).toBe(FORMER_CLIENT_ENABLE_TEXT);
    expect(FORMER_CLIENT_ENABLE_TEXT).toMatch(/cannot be enabled again/);
  });

  it('a new login or an invite on the email or the contact of one', () => {
    expect(loginRefusalText(refused('email-was-client'), 'x')).toBe(EMAIL_WAS_CLIENT_TEXT);
    expect(loginRefusalText(refused('contact-was-client'), 'x')).toBe(CONTACT_WAS_CLIENT_TEXT);
  });

  it('any other refusal shows the brain words, else the fallback', () => {
    expect(loginRefusalText(refused('last-admin', 'Keep one admin.'), 'x')).toBe('Keep one admin.');
    expect(
      loginRefusalText(refused(undefined, 'A user with that email already exists.'), 'x'),
    ).toBe('A user with that email already exists.');
    expect(loginRefusalText(new ApiError('', 500), 'Could not save')).toBe('Could not save');
    expect(loginRefusalText(new ApiError('unauthorized', 401), 'Could not save')).toBe(
      'Could not save',
    );
    expect(loginRefusalText(new Error('boom'), 'Could not save')).toBe('Could not save');
  });

  it('reads the reason only from a brain refusal', () => {
    expect(refusalReason(refused('former-client'))).toBe('former-client');
    expect(refusalReason(refused(undefined))).toBeNull();
    expect(refusalReason(new Error('x'))).toBeNull();
    expect(formerClientText('contact-taken')).toBeNull();
    expect(formerClientText(undefined)).toBeNull();
  });

  it('says it plainly: no dashes, no codes', () => {
    for (const t of [FORMER_CLIENT_ENABLE_TEXT, EMAIL_WAS_CLIENT_TEXT, CONTACT_WAS_CLIENT_TEXT]) {
      expect(t).not.toMatch(/[\u2013\u2014]|-client|former-/);
    }
  });
});
