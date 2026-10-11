import type { ShellRole } from './workspaces';

/** The owner's live-update stream. */
export const OWNER_REALTIME_PATH = '/api/realtime';

/** A member's own stream (own space and team-shared changes), kept in W5c. */
export const MEMBER_REALTIME_PATH = '/api/member/realtime';

/**
 * Which live-update stream a login opens, by the shell's role (phase W5c:
 * /api/realtime answers the owner only). An admin reads the owner's stream,
 * a member its own, a client none (it reads no data routes in W5c). null
 * while the shell has not answered: nothing opens until it has. Pure,
 * pinned by realtime-stream.test.ts.
 */
export function realtimeStreamPath(role: ShellRole | null): string | null {
  switch (role) {
    case 'admin':
      return OWNER_REALTIME_PATH;
    case 'member':
      return MEMBER_REALTIME_PATH;
    default:
      return null;
  }
}
