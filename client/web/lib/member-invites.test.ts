import { describe, expect, it } from 'vitest';
import {
  CODE_NOT_VALID,
  acceptOutcome,
  inviteCreateErrorText,
  inviteLink,
  readInviteCode,
  validateInviteForm,
} from './member-invites';

describe('inviteLink', () => {
  it('prefixes the client origin to the brain link path', () => {
    expect(inviteLink('https://app.example.com', '/invite?code=AbC23xyz')).toBe(
      'https://app.example.com/invite?code=AbC23xyz',
    );
  });

  it('never doubles or drops the slash', () => {
    expect(inviteLink('https://app.example.com/', '/invite?code=a')).toBe(
      'https://app.example.com/invite?code=a',
    );
    expect(inviteLink('https://app.example.com', 'invite?code=a')).toBe(
      'https://app.example.com/invite?code=a',
    );
  });
});

describe('readInviteCode', () => {
  it('keeps a bare code as typed, case and all', () => {
    expect(readInviteCode('  AbCd2345efGH6789 ')).toBe('AbCd2345efGH6789');
  });

  it('takes an old 8-character team code', () => {
    expect(readInviteCode('Xy7kPq2M')).toBe('Xy7kPq2M');
  });

  it('drops spaces a person typed inside the code', () => {
    expect(readInviteCode('AbCd 2345 efGH')).toBe('AbCd2345efGH');
  });

  it('pulls the code out of a pasted link', () => {
    expect(readInviteCode('https://app.example.com/invite?code=AbC23xyz')).toBe('AbC23xyz');
    expect(readInviteCode('/invite?code=AbC23xyz')).toBe('AbC23xyz');
  });
});

describe('inviteCreateErrorText', () => {
  it('names an existing login by email', () => {
    expect(inviteCreateErrorText(409, { reason: 'email-has-login', error: 'x' })).toMatch(
      /already signs in with that email/,
    );
  });

  it('names an existing login for the contact', () => {
    expect(inviteCreateErrorText(409, { reason: 'contact-has-login' })).toMatch(
      /contact already has a login/,
    );
  });

  it('asks for an email when the contact has none', () => {
    expect(inviteCreateErrorText(400, { reason: 'no-email' })).toMatch(/Enter the email/);
  });

  it('says a contact is gone', () => {
    expect(inviteCreateErrorText(400, { reason: 'contact-not-found' })).toMatch(
      /not in this brain/,
    );
  });

  it('reads a bare 400 as a bad email', () => {
    expect(inviteCreateErrorText(400, { error: 'Choose a contact or enter an email.' })).toMatch(
      /valid email/,
    );
  });

  it('falls back to the brain message, then a generic line', () => {
    expect(inviteCreateErrorText(500, { error: 'Boom.' })).toBe('Boom.');
    expect(inviteCreateErrorText(502, undefined)).toMatch(/Could not create the invite/);
  });
});

describe('validateInviteForm', () => {
  const ok = { code: 'AbCd2345efGH6789', password: 'long-enough', confirm: 'long-enough' };

  it('accepts a complete form', () => {
    expect(validateInviteForm(ok)).toEqual({});
  });

  it('needs a code', () => {
    expect(validateInviteForm({ ...ok, code: '   ' }).code).toBeDefined();
  });

  it('needs at least 8 characters, as the brain does', () => {
    expect(validateInviteForm({ ...ok, password: 'short77', confirm: 'short77' }).password).toMatch(
      /at least 8/,
    );
    expect(validateInviteForm({ ...ok, password: 'eight888', confirm: 'eight888' })).toEqual({});
  });

  it('needs the repeat to match', () => {
    expect(validateInviteForm({ ...ok, confirm: 'something-else' }).confirm).toMatch(/differ/);
  });
});

describe('acceptOutcome', () => {
  it('is ok on a 200, with the login email', () => {
    expect(acceptOutcome(200, { ok: true, email: 'sam@example.com' })).toEqual({
      kind: 'ok',
      email: 'sam@example.com',
    });
  });

  it('reads a 401 as a bad code, never as signed out', () => {
    expect(acceptOutcome(401, { error: 'This invite is not valid. Ask for a new one.' })).toEqual({
      kind: 'bad-code',
      message: CODE_NOT_VALID,
    });
    expect(CODE_NOT_VALID).toMatch(/^That code is not valid/);
  });

  it('shows the brain rule on a 400', () => {
    expect(acceptOutcome(400, { error: 'Choose a password of at least 8 characters.' })).toEqual({
      kind: 'error',
      message: 'Choose a password of at least 8 characters.',
    });
  });

  it('says to wait on a 429', () => {
    expect(acceptOutcome(429, {}).kind).toBe('error');
    expect((acceptOutcome(429, {}) as { message: string }).message).toMatch(/Too many/);
  });

  it('is a generic error for anything else', () => {
    expect(acceptOutcome(502, 'nope')).toEqual({
      kind: 'error',
      message: 'Could not accept the invite. Try again.',
    });
  });
});
