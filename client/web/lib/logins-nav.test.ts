import { describe, expect, it } from 'vitest';
import { EMAIL_CODE, initialSelection, inviteIdOf, inviteKey, loginsHref } from './logins-nav';

const LOGIN = '0b8f3c2e-1111-4111-8111-111111111111';

describe('links into Settings > Users', () => {
  it('selects a login, an invite or the email code entry', () => {
    expect(loginsHref()).toBe('/settings/users');
    expect(loginsHref(LOGIN)).toBe(`/settings/users?selected=${LOGIN}`);
    expect(loginsHref(EMAIL_CODE)).toBe('/settings/users?selected=email-code');
  });

  it('an invite key round-trips, and nothing else reads as one', () => {
    expect(inviteIdOf(inviteKey('i-1'))).toBe('i-1');
    expect(inviteIdOf(LOGIN)).toBeNull();
    expect(inviteIdOf(EMAIL_CODE)).toBeNull();
    expect(inviteIdOf('invite:')).toBeNull();
    expect(inviteIdOf(null)).toBeNull();
  });
});

describe('the first selection from a deep link', () => {
  it('a login or the email code entry', () => {
    expect(initialSelection(LOGIN)).toBe(LOGIN);
    expect(initialSelection(EMAIL_CODE)).toBe(EMAIL_CODE);
  });

  it('nothing selected: the plain list', () => {
    expect(initialSelection(null)).toBeNull();
    expect(initialSelection(undefined)).toBeNull();
  });

  it('the old Clients steps open the plain list (W5c)', () => {
    for (const old of ['what-clients-see', 'client-settings']) {
      expect(initialSelection(old)).toBeNull();
    }
  });
});
