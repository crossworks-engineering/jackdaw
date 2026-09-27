import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { isMemberLoginRefusal, memberHome } from './member-destination';
import { sendsMemberHome } from './member-surface';

describe('memberHome', () => {
  it('sends a member home, keeping a destination a member may open', () => {
    expect(memberHome(null)).toBe('/');
    expect(memberHome('/pages')).toBe('/pages');
    expect(memberHome('/pages/abc?x=1')).toBe('/pages/abc?x=1');
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
  const PUBLIC = ['/login', '/env.js', '/team', '/hub', '/pair'];
  it('sends a hinted member off admin-only paths', () => {
    expect(sendsMemberHome('/models', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/team-admin', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/settings', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/pagesx', PUBLIC)).toBe(true);
    // The old member surface is gone: chat is the dock now.
    expect(sendsMemberHome('/m', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/m/chat', PUBLIC)).toBe(true);
  });
  it('leaves the member home, member screens and public surfaces alone', () => {
    expect(sendsMemberHome('/', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/pages/abc', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/files', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/login', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/team/x', PUBLIC)).toBe(false);
  });
});
