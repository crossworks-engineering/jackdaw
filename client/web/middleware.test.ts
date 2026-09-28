import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/** The client middleware's routing for /invite (member logins, Phase 6): a
 *  public page, reachable with no session AND with one. */
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
