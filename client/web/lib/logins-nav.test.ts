import { describe, expect, it } from 'vitest';
import {
  EMAIL_CODE,
  initialSelection,
  inviteIdOf,
  inviteKey,
  loginChatHref,
  loginsHref,
} from './logins-nav';

const LOGIN = '0b8f3c2e-1111-4111-8111-111111111111';

describe('links into Settings > Users', () => {
  it('selects a login, an invite or the email code entry, and opens a Chat', () => {
    expect(loginsHref()).toBe('/settings/users');
    expect(loginsHref(LOGIN)).toBe(`/settings/users?selected=${LOGIN}`);
    expect(loginsHref(EMAIL_CODE)).toBe('/settings/users?selected=email-code');
    expect(loginChatHref(LOGIN)).toBe(`/settings/users?selected=${LOGIN}&view=chat`);
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
  it('a login, with its Chat when asked', () => {
    expect(initialSelection(LOGIN, null)).toEqual({ selected: LOGIN, chat: false });
    expect(initialSelection(LOGIN, 'chat')).toEqual({ selected: LOGIN, chat: true });
    expect(initialSelection(EMAIL_CODE, null)).toEqual({ selected: EMAIL_CODE, chat: false });
  });

  it('nothing selected: the plain list', () => {
    expect(initialSelection(null, null)).toEqual({ selected: null, chat: false });
    expect(initialSelection(null, 'chat')).toEqual({ selected: null, chat: false });
  });

  it('the old Clients steps open the plain list, with no Chat (W5c)', () => {
    for (const old of ['what-clients-see', 'client-settings']) {
      expect(initialSelection(old, null)).toEqual({ selected: null, chat: false });
      expect(initialSelection(old, 'chat')).toEqual({ selected: null, chat: false });
    }
  });
});
