import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { isMemberLoginRefusal, memberHome } from './member-destination';
import { sendsMemberHome } from './member-surface';

describe('memberHome', () => {
  it('sends a member to /m, keeping a destination already inside it', () => {
    expect(memberHome(null)).toBe('/m');
    expect(memberHome('/pages')).toBe('/m');
    expect(memberHome('/m/chat')).toBe('/m/chat');
    expect(memberHome('/m?id=x')).toBe('/m?id=x');
    expect(memberHome('/models')).toBe('/m');
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
  it('sends a hinted member from owner paths to /m', () => {
    expect(sendsMemberHome('/', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/pages/abc', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/models', PUBLIC)).toBe(true);
    expect(sendsMemberHome('/team-admin', PUBLIC)).toBe(true);
  });
  it('leaves member and public surfaces alone', () => {
    expect(sendsMemberHome('/m', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/m/chat', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/login', PUBLIC)).toBe(false);
    expect(sendsMemberHome('/team/x', PUBLIC)).toBe(false);
  });
});
