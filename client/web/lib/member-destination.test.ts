import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  isAdminLoginRefusal,
  isClientLoginRefusal,
  isLoginRefusal,
  isMemberLoginRefusal,
  loginRefusalReason,
  memberHome,
  onboardingExitFor,
} from './member-destination';
import { sendsMemberHome } from './member-surface';

describe('memberHome', () => {
  it('sends a member home, keeping a destination a member may open', () => {
    expect(memberHome(null)).toBe('/');
    expect(memberHome('/pages')).toBe('/pages');
    expect(memberHome('/pages/abc?x=1')).toBe('/pages/abc?x=1');
    expect(memberHome('/notes?selected=n1')).toBe('/notes?selected=n1');
    expect(memberHome('/draw/abc')).toBe('/draw/abc');
    expect(memberHome('/tables')).toBe('/tables');
    expect(memberHome('/files')).toBe('/files');
    expect(memberHome('/m/chat')).toBe('/');
    expect(memberHome('/models')).toBe('/');
    expect(memberHome('/settings/profile')).toBe('/');
    expect(memberHome('//evil.example')).toBe('/');
  });
});

describe('isMemberLoginRefusal', () => {
  it('matches only the brain refusing a member on an admin route', () => {
    expect(
      isMemberLoginRefusal(
        new ApiError('forbidden', 403, { error: 'forbidden', reason: 'member-login' }),
      ),
    ).toBe(true);
    expect(isMemberLoginRefusal(new ApiError('forbidden', 403, { reason: 'admin-login' }))).toBe(
      false,
    );
    expect(isMemberLoginRefusal(new ApiError('unauthorized', 401))).toBe(false);
    expect(isMemberLoginRefusal(new Error('x'))).toBe(false);
  });
});

describe('sendsMemberHome', () => {
  const PUBLIC = ['/login', '/env.js', '/pair', '/invite'];
  it('sends a hinted member off admin-only paths', () => {
    expect(sendsMemberHome('/models', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/team-admin', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/settings', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/pagesx', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/appsx', PUBLIC)).toBe(true);
    // The old member surface is gone: chat is the dock now.
    expect(sendsMemberHome('/m', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/m/chat', PUBLIC)).toBe(true);
    // So is the team-code portal (member logins Phase 6).
    expect(sendsMemberHome('/team', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/hub', PUBLIC)).toBe(true);
  });
  it('leaves the member home, member screens and public surfaces alone', () => {
    expect(sendsMemberHome('/', PUBLIC)).toBe(false);
    // Every workspace kind a member works in, list and item routes.
    for (const p of ['/pages', '/notes', '/draw', '/tables', '/files', '/apps']) {
      expect(sendsMemberHome(p, PUBLIC), p).toBe(false);
      expect(sendsMemberHome(`${p}/abc`, PUBLIC), `${p}/abc`).toBe(false);
    }
    expect(sendsMemberHome('/pages/abc', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/files', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/login', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/invite', PUBLIC)).toBe(false);
  });
});

describe('isAdminLoginRefusal', () => {
  it('matches only the brain refusing an admin on a member route', () => {
    expect(
      isAdminLoginRefusal(
        new ApiError('forbidden', 403, { error: 'forbidden', reason: 'admin-login' }),
      ),
    ).toBe(true);
    // A proxy or WAF 403 carries no reason: it must not flip the shell.
    expect(isAdminLoginRefusal(new ApiError('Forbidden', 403))).toBe(false);
    expect(isAdminLoginRefusal(new ApiError('forbidden', 403, { reason: 'member-login' }))).toBe(
      false,
    );
    expect(isAdminLoginRefusal(new ApiError('unauthorized', 401))).toBe(false);
  });
});

describe('the member nav', () => {
  it('links only to paths a member may open (a new item needs its prefix)', async () => {
    const { MEMBER_NAV } = await import('./member-nav');
    for (const item of MEMBER_NAV.flatMap((g) => g.items)) {
      if (item.chat) continue;
      expect(sendsMemberHome(item.href, []), item.href).toBe(false);
    }
  });
});

describe('the client-login refusal (client logins C0)', () => {
  const refused = (reason: string) =>
    new ApiError('forbidden', 403, { error: 'forbidden', reason, message: 'x' });

  it('names the caller for each of the three reasons, and nothing else', () => {
    expect(loginRefusalReason(refused('member-login'))).toBe('member-login');
    expect(loginRefusalReason(refused('admin-login'))).toBe('admin-login');
    expect(loginRefusalReason(refused('client-login'))).toBe('client-login');
    // A reason this app does not know, a bare proxy 403, the same reason on
    // another status, or no ApiError at all: nobody is named.
    expect(loginRefusalReason(refused('guest-login'))).toBeNull();
    expect(loginRefusalReason(new ApiError('Forbidden', 403))).toBeNull();
    expect(
      loginRefusalReason(new ApiError('x', 400, { reason: 'client-links-retired' })),
    ).toBeNull();
    expect(loginRefusalReason(new ApiError('x', 401, { reason: 'client-login' }))).toBeNull();
    expect(loginRefusalReason(new Error('client-login'))).toBeNull();
    expect(loginRefusalReason(undefined)).toBeNull();
  });

  it('isClientLoginRefusal matches the client refusal only', () => {
    expect(isClientLoginRefusal(refused('client-login'))).toBe(true);
    expect(isClientLoginRefusal(refused('member-login'))).toBe(false);
    expect(isClientLoginRefusal(refused('admin-login'))).toBe(false);
    expect(isClientLoginRefusal(new ApiError('Forbidden', 403))).toBe(false);
  });

  it('a client refusal is never read as a member or an admin one', () => {
    expect(isMemberLoginRefusal(refused('client-login'))).toBe(false);
    expect(isAdminLoginRefusal(refused('client-login'))).toBe(false);
  });

  it('isLoginRefusal covers all three (no retry on any of them)', () => {
    for (const r of ['member-login', 'admin-login', 'client-login']) {
      expect(isLoginRefusal(refused(r)), r).toBe(true);
    }
    expect(isLoginRefusal(new ApiError('boom', 500))).toBe(false);
    expect(isLoginRefusal(new ApiError('Forbidden', 403))).toBe(false);
  });
});

describe('onboardingExitFor (audit A30e)', () => {
  const refused = (reason: string) =>
    new ApiError('forbidden', 403, { error: 'forbidden', reason });

  it('sends a member or client login home instead of a dead-end Retry', () => {
    expect(onboardingExitFor(refused('member-login'))).toBe('/');
    expect(onboardingExitFor(refused('client-login'))).toBe('/');
  });

  it('stays for anything Retry may cure, or nothing at all', () => {
    expect(onboardingExitFor(null)).toBeNull();
    expect(onboardingExitFor(new ApiError('boom', 500))).toBeNull();
    expect(onboardingExitFor(new ApiError('Forbidden', 403))).toBeNull();
    expect(onboardingExitFor(new TypeError('fetch failed'))).toBeNull();
    expect(onboardingExitFor(refused('admin-login'))).toBeNull();
  });
});
