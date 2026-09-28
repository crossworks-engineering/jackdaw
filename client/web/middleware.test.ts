import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/** The client middleware's routing for /invite (member logins, Phase 6): a
 *  public page, reachable with no session AND with one. And for the retired
 *  team-code portal: /team and /hub are no longer public. */
function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(new URL(path, 'http://client.test'));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

const location = (res: Response) => res.headers.get('location');

describe('middleware: /invite', () => {
  it('renders with no session (no bounce to /login)', () => {
    const res = middleware(request('/invite?code=AbCd2345efGH6789'));
    expect(location(res)).toBeNull();
  });

  it('is not sent to the member home for a hinted member', () => {
    const res = middleware(
      request('/invite?code=AbCd2345efGH6789', { mantle_authed: '1', mantle_member: '1' }),
    );
    expect(location(res)).toBeNull();
  });

  it('renders for a signed-in admin', () => {
    const res = middleware(request('/invite', { mantle_authed: '1' }));
    expect(location(res)).toBeNull();
  });

  it('still bounces an owner path with no session (the control)', () => {
    const res = middleware(request('/team-admin'));
    expect(location(res)).toMatch(/\/login\?next=/);
  });

  it('still sends a hinted member off an admin path (the control)', () => {
    const res = middleware(request('/team-admin', { mantle_authed: '1', mantle_member: '1' }));
    expect(new URL(location(res)!).pathname).toBe('/');
  });
});

describe('middleware: the retired team portal', () => {
  // /team and /hub were public (a team-code holder had no session). The
  // portal is gone (member logins Phase 6), so they are ordinary paths now:
  // no session bounces to /login like any owner path.
  for (const path of ['/team', '/team/forum', '/team/pages?s=abc', '/hub']) {
    it(`bounces ${path} with no session`, () => {
      const res = middleware(request(path));
      expect(location(res)).toMatch(/\/login\?next=/);
    });
  }

  it('sends a hinted member off /team and /hub to the member home', () => {
    for (const path of ['/team', '/hub']) {
      const res = middleware(request(path, { mantle_authed: '1', mantle_member: '1' }));
      expect(new URL(location(res)!).pathname, path).toBe('/');
    }
  });

  it('no longer flags any path as a member surface', () => {
    const res = middleware(request('/team', { mantle_authed: '1' }));
    expect(res.headers.get('x-middleware-request-x-mantle-member-surface')).toBeNull();
  });

  it('leaves /team-admin (the owner console) to the presence gate', () => {
    expect(location(middleware(request('/team-admin', { mantle_authed: '1' })))).toBeNull();
  });
});
