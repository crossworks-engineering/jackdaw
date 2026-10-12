import { describe, expect, it } from 'vitest';
import { MEMBER_REALTIME_PATH, OWNER_REALTIME_PATH, realtimeStreamPath } from './realtime-stream';

/** The live-update stream by role (W5c: /api/realtime is the owner's). */
describe('realtimeStreamPath', () => {
  it("an admin opens the owner's stream", () => {
    expect(realtimeStreamPath('admin')).toBe('/api/realtime');
    expect(OWNER_REALTIME_PATH).toBe('/api/realtime');
  });

  it('a member opens its own kept stream', () => {
    expect(realtimeStreamPath('member')).toBe('/api/member/realtime');
    expect(MEMBER_REALTIME_PATH).toBe('/api/member/realtime');
  });

  it('nothing opens before the shell answers', () => {
    expect(realtimeStreamPath(null)).toBeNull();
  });
});
