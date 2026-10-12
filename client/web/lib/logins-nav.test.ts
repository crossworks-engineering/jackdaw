import { describe, expect, it } from 'vitest';
import { initialSelection, inviteIdOf, inviteKey, loginsHref } from './logins-nav';

const LOGIN = '0b8f3c2e-1111-4111-8111-111111111111';

describe('links into Settings > Users', () => {
  it('selects a login or an invite', () => {
    expect(loginsHref()).toBe('/settings/users');
    expect(loginsHref(LOGIN)).toBe(`/settings/users?selected=${LOGIN}`);
    expect(loginsHref(inviteKey('i-1'))).toBe('/settings/users?selected=invite%3Ai-1');
  });

  it('an invite key round-trips, and nothing else reads as one', () => {
    expect(inviteIdOf(inviteKey('i-1'))).toBe('i-1');
    expect(inviteIdOf(LOGIN)).toBeNull();
    expect(inviteIdOf('email-code')).toBeNull();
    expect(inviteIdOf('invite:')).toBeNull();
    expect(inviteIdOf(null)).toBeNull();
  });
});

describe('the first selection from a deep link', () => {
  it('a login', () => {
    expect(initialSelection(LOGIN)).toBe(LOGIN);
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

  it('the old Sign-in by email code entry opens the plain list (W8)', () => {
    expect(initialSelection('email-code')).toBeNull();
  });
});
