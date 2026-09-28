import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/** The client middleware's routing for /invite (member logins, Phase 6): a
 *  public page, reachable with no session AND with one. And for the retired
 *  team-code portal: /team and /hub go straight to /login. */
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
  // /team and /hub were the team-code portal. It is gone (member logins
  // Phase 6), so every visit goes straight to /login, the same as the brain
  // (mountRetiredTeamPages): a 307, no `next`, no query (an old link may hold
  // a team code), whoever is asking.
  const RETIRED = [
    '/team',
    '/team/',
    '/team/forum',
    '/team/forum/abc',
    '/team/pages?s=abc',
    '/team?code=Xy7kPq2M',
    '/team/forum?code=Xy7kPq2M&x=1',
    '/hub',
    '/hub/',
    '/hub/briefing?code=Xy7kPq2M',
  ];
  const SESSIONS: Record<string, Record<string, string>> = {
    'no session': {},
    'an admin': { mantle_authed: '1' },
    'a hinted member': { mantle_authed: '1', mantle_member: '1' },
  };

  for (const [who, cookies] of Object.entries(SESSIONS)) {
    for (const path of RETIRED) {
      it(`sends ${who} on ${path} to /login with no next and no query`, () => {
        const res = middleware(request(path, cookies));
        expect(res.status).toBe(307);
        const to = new URL(location(res)!);
        expect(to.pathname).toBe('/login');
        expect(to.search).toBe('');
        expect(to.searchParams.has('next')).toBe(false);
        expect(location(res)).not.toMatch(/code|Xy7kPq2M|team|hub/);
      });
    }
  }

  it('leaves /team-admin (the owner console) to the presence gate', () => {
    expect(location(middleware(request('/team-admin', { mantle_authed: '1' })))).toBeNull();
    expect(location(middleware(request('/team-admin?view=shares')))).toMatch(
      /\/login\?next=%2Fteam-admin/,
    );
  });

  it('leaves a path that only starts with the letters (/teams, /hubs) to the gate', () => {
    for (const path of ['/teams', '/hubs', '/hub-app']) {
      expect(location(middleware(request(path, { mantle_authed: '1' }))), path).toBeNull();
      expect(location(middleware(request(path))), path).toMatch(/\/login\?next=/);
    }
  });

  it('no longer flags any path as a member surface', () => {
    const res = middleware(request('/team', { mantle_authed: '1' }));
    expect(res.headers.get('x-middleware-request-x-mantle-member-surface')).toBeNull();
  });
});

describe('middleware: a member follows an item link', () => {
  const member = { mantle_authed: '1', mantle_member: '1' };

  it('lets a hinted member open /n/<id> (the team agent cites sources so)', () => {
    expect(location(middleware(request('/n/55555555-5555-4555-8555-555555555555', member)))).toBeNull();
  });

  it('lets a hinted member open /notes/<id> and /tables/<id>', () => {
    for (const path of ['/notes/abc', '/tables/abc']) {
      expect(location(middleware(request(path, member))), path).toBeNull();
    }
  });

  it('still sends a hinted member off an admin path that only starts with n', () => {
    for (const path of ['/nodes/abc/history', '/n-other']) {
      expect(new URL(location(middleware(request(path, member)))!).pathname, path).toBe('/');
    }
  });
});
