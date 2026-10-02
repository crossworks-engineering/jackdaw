import { describe, expect, it } from 'vitest';
import {
  CLIENT_SIGNIN_PATH,
  clientHomeHref,
  clientItemIdFromPath,
  clientLoginPageRedirect,
  clientRedirectFor,
} from './client-surface';

/**
 * The client portal's routing (client logins C2): a client has one screen,
 * `/`, with the open item in the query. Any other path goes home, and a path
 * that names an item (a permalink a client was sent) opens it there.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const PUBLIC = ['/login', '/env.js', '/pair', '/invite', '/client-signin'];

describe('clientItemIdFromPath', () => {
  it('reads the id from the permalink and from each kind route', () => {
    for (const p of ['/n', '/pages', '/notes', '/draw', '/tables', '/files']) {
      expect(clientItemIdFromPath(`${p}/${ID}`), p).toBe(ID);
    }
  });

  it('is null for anything else: a list, an owner route, a non-uuid, a deeper path', () => {
    for (const p of [
      '/',
      '/pages',
      `/settings/${ID}`,
      `/team-admin/${ID}`,
      '/n/not-an-id',
      `/n/${ID}/edit`,
      `/apps/${ID}`,
    ]) {
      expect(clientItemIdFromPath(p), p).toBeNull();
    }
  });
});

describe('clientHomeHref', () => {
  it('is the home, with the item open when given', () => {
    expect(clientHomeHref()).toBe('/');
    expect(clientHomeHref(null)).toBe('/');
    expect(clientHomeHref(ID)).toBe(`/?id=${ID}`);
  });
});

describe('clientRedirectFor', () => {
  it('stays on the home and on the public pages', () => {
    for (const p of ['/', '/client-signin', '/invite', '/pair']) {
      expect(clientRedirectFor(p, PUBLIC), p).toBeNull();
    }
  });

  it('sends every owner and member screen to the home', () => {
    for (const p of ['/pages', '/settings', '/settings/users', '/team-admin', '/apps', '/tasks']) {
      expect(clientRedirectFor(p, PUBLIC), p).toBe('/');
    }
  });

  it('opens a named item in the portal', () => {
    expect(clientRedirectFor(`/n/${ID}`, PUBLIC)).toBe(`/?id=${ID}`);
    expect(clientRedirectFor(`/pages/${ID}`, PUBLIC)).toBe(`/?id=${ID}`);
  });
});

describe('clientLoginPageRedirect (a hinted client on /login)', () => {
  const q = (s: string) => new URLSearchParams(s);

  it('goes to the client sign-in page, whatever else the query says', () => {
    expect(clientLoginPageRedirect(q(''))).toBe(CLIENT_SIGNIN_PATH);
    expect(clientLoginPageRedirect(q('next=/settings'))).toBe(CLIENT_SIGNIN_PATH);
    expect(clientLoginPageRedirect(q('add=0'))).toBe(CLIENT_SIGNIN_PATH);
  });

  it('except Add login, which a held client login opens from its own menu', () => {
    expect(clientLoginPageRedirect(q('add=1'))).toBeNull();
    expect(clientLoginPageRedirect(q('add=1&session=abc'))).toBeNull();
  });
});
