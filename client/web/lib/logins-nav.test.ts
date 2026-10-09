import { describe, expect, it } from 'vitest';
import {
  CLIENT_SETTINGS,
  WHAT_CLIENTS_SEE,
  inviteIdOf,
  inviteKey,
  loginChatHref,
  loginsHref,
  movedTeamAdminHref,
} from './logins-nav';

const LOGIN = '0b8f3c2e-1111-4111-8111-111111111111';

/** Settings > Logins took Invites, Clients, What clients see and Member
 *  chats from Team admin (2026-10-09, part 1). */
describe('links into Settings > Logins', () => {
  it('selects a login, an invite or a client step, and opens a Chat', () => {
    expect(loginsHref()).toBe('/settings/users');
    expect(loginsHref(LOGIN)).toBe(`/settings/users?selected=${LOGIN}`);
    expect(loginsHref(WHAT_CLIENTS_SEE)).toBe('/settings/users?selected=what-clients-see');
    expect(loginsHref(CLIENT_SETTINGS)).toBe('/settings/users?selected=client-settings');
    expect(loginChatHref(LOGIN)).toBe(`/settings/users?selected=${LOGIN}&view=chat`);
  });

  it('an invite key round-trips, and nothing else reads as one', () => {
    expect(inviteIdOf(inviteKey('i-1'))).toBe('i-1');
    expect(inviteIdOf(LOGIN)).toBeNull();
    expect(inviteIdOf(WHAT_CLIENTS_SEE)).toBeNull();
    expect(inviteIdOf('invite:')).toBeNull();
    expect(inviteIdOf(null)).toBeNull();
  });
});

describe('old Team admin links', () => {
  it('Invites lands on Logins', () => {
    expect(movedTeamAdminHref({ view: 'invites' })).toBe('/settings/users');
  });

  it("Member chats lands on the login's Chat, or on Logins", () => {
    expect(movedTeamAdminHref({ view: 'chats', login: LOGIN })).toBe(
      `/settings/users?selected=${LOGIN}&view=chat`,
    );
    expect(movedTeamAdminHref({ view: 'chats' })).toBe('/settings/users');
  });

  it('Clients and What clients see land on the first client step', () => {
    expect(movedTeamAdminHref({ view: 'client-logins' })).toBe(
      '/settings/users?selected=what-clients-see',
    );
    expect(movedTeamAdminHref({ view: 'clients' })).toBe(
      '/settings/users?selected=what-clients-see',
    );
  });

  it('the tabs that stay, and the removed Chat archive, stay on Team admin', () => {
    for (const view of [undefined, 'review', 'requests', 'shares', 'settings', 'topics']) {
      expect(movedTeamAdminHref({ view })).toBeNull();
    }
  });
});
