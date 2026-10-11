import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  heartbeatFireRefusal,
  heartbeatMakerText,
  heartbeatStateHidden,
  isHeartbeatMaker,
  userNames,
} from './heartbeat-maker';

const OWNER = { loginId: 'aaaaaaaa-0000-4000-8000-000000000001', isOwner: true };
const SECOND_ADMIN = { loginId: 'bbbbbbbb-0000-4000-8000-000000000002', isOwner: false };

describe("a heartbeat's maker (W7a)", () => {
  it('is its createdBy, or the brain owner when it has none', () => {
    expect(isHeartbeatMaker({ createdBy: null }, OWNER)).toBe(true);
    expect(isHeartbeatMaker({ createdBy: null }, SECOND_ADMIN)).toBe(false);
    expect(isHeartbeatMaker({ createdBy: SECOND_ADMIN.loginId }, SECOND_ADMIN)).toBe(true);
    expect(isHeartbeatMaker({ createdBy: SECOND_ADMIN.loginId.toUpperCase() }, SECOND_ADMIN)).toBe(
      true,
    );
    expect(isHeartbeatMaker({ createdBy: SECOND_ADMIN.loginId }, OWNER)).toBe(false);
    // An older brain sends no createdBy: the owner's.
    expect(isHeartbeatMaker({}, OWNER)).toBe(true);
    expect(isHeartbeatMaker({}, SECOND_ADMIN)).toBe(false);
  });

  it('is nobody until the viewer is known (no Fire now before the shell answers)', () => {
    expect(isHeartbeatMaker({ createdBy: null }, undefined)).toBe(false);
    expect(isHeartbeatMaker({ createdBy: null }, null)).toBe(false);
  });

  it('names who set it up', () => {
    const names = userNames([
      { id: SECOND_ADMIN.loginId.toUpperCase(), displayName: 'Ada', email: 'ada@example.test' },
      { id: 'c', displayName: null, email: 'c@example.test' },
    ]);
    expect(heartbeatMakerText({ createdBy: null }, OWNER)).toBe('You');
    expect(heartbeatMakerText({ createdBy: null }, SECOND_ADMIN)).toBe('The brain owner');
    expect(heartbeatMakerText({ createdBy: SECOND_ADMIN.loginId }, OWNER, names)).toBe('Ada');
    expect(heartbeatMakerText({ createdBy: 'c' }, OWNER, names)).toBe('c@example.test');
    expect(heartbeatMakerText({ createdBy: SECOND_ADMIN.loginId }, OWNER)).toBe('Another user');
  });

  it("hides another user's state", () => {
    expect(heartbeatStateHidden({ createdBy: null }, OWNER)).toBe(false);
    expect(heartbeatStateHidden({ createdBy: null, stateHidden: true }, OWNER)).toBe(true);
    expect(heartbeatStateHidden({ createdBy: null }, SECOND_ADMIN)).toBe(true);
  });
});

describe('a refused Fire now', () => {
  it("shows the brain's words on a 403, plain words when there are none", () => {
    expect(
      heartbeatFireRefusal(new ApiError('Only its maker fires this heartbeat.', 403, {})),
    ).toBe('Only its maker fires this heartbeat.');
    expect(heartbeatFireRefusal(new ApiError('forbidden', 403, {}))).toMatch(
      /Only the user who set up/,
    );
  });

  it('says nothing for a 401 and passes any other error through', () => {
    expect(heartbeatFireRefusal(new ApiError('unauthorized', 401))).toBeNull();
    expect(heartbeatFireRefusal(new ApiError('boom', 500, {}))).toBe('boom');
    expect(heartbeatFireRefusal(new Error('net'))).toBe('net');
  });
});
