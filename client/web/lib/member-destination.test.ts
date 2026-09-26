import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { isMemberLoginRefusal, memberHome } from './member-destination';

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
