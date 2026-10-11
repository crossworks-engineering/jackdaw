import { describe, expect, it } from 'vitest';
import { CLIENT_SIGNIN_PATH, clientItemIdFromPath } from './client-surface';

/** The item id a path names (client logins C2), and the client sign-in path. */
const ID = '11111111-1111-4111-8111-111111111111';

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

describe('CLIENT_SIGNIN_PATH', () => {
  it('is the client sign-in page', () => {
    expect(CLIENT_SIGNIN_PATH).toBe('/client-signin');
  });
});
