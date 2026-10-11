/**
 * Who set up a heartbeat, and what that means for the viewer (workspaces
 * W7a). A heartbeat runs in the scope of its MAKER (`createdBy`, null for
 * the brain owner). Only the maker fires it ("Fire now"; anyone else gets
 * 403), and only the maker reads its state and what its fires said and
 * changed: for anyone else the brain sends `state` as `{}` with
 * `stateHidden`, and a fire's reply, states and trace as null.
 *
 * Pure: pinned by heartbeat-maker.test.ts.
 */
import { ApiError } from '@mantle/web-ui/api-fetch';

/** Who is looking: the shell's login and owner flag. */
export type HeartbeatViewer = { loginId: string; isOwner: boolean };

type Made = { createdBy?: string | null };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Whether the viewer is the heartbeat's maker: its `createdBy`, or the
 *  brain owner when it has none. False until the viewer is known. */
export function isHeartbeatMaker(hb: Made, viewer: HeartbeatViewer | null | undefined): boolean {
  if (!viewer) return false;
  const maker = hb.createdBy ?? null;
  return maker === null ? viewer.isOwner : same(maker, viewer.loginId);
}

/** Who set it up, as the screen says it: you, the brain owner, a user's
 *  name (when the viewer may list users), else another user. */
export function heartbeatMakerText(
  hb: Made,
  viewer: HeartbeatViewer | null | undefined,
  names?: ReadonlyMap<string, string>,
): string {
  if (isHeartbeatMaker(hb, viewer)) return 'You';
  const maker = hb.createdBy ?? null;
  if (maker === null) return 'The brain owner';
  return names?.get(maker.toLowerCase()) ?? 'Another user';
}

/** The words for what only the maker reads. */
export const NOT_YOURS = 'Not yours';
export const HIDDEN_STATE_TEXT =
  'This heartbeat was set up by another user: only they see its state, and what its fires said and changed.';

/** Whether the state is hidden from this viewer (the brain says so, or the
 *  viewer is not the maker). */
export function heartbeatStateHidden(
  hb: Made & { stateHidden?: boolean },
  viewer: HeartbeatViewer | null | undefined,
): boolean {
  return hb.stateHidden === true || !isHeartbeatMaker(hb, viewer);
}

/** The toast for a refused Fire now: the brain's words on a 403, else the
 *  error's own. Null for a 401 (already sent to sign in). */
export function heartbeatFireRefusal(e: unknown): string | null {
  if (e instanceof ApiError) {
    if (e.status === 401) return null;
    if (e.status === 403) {
      return e.message && e.message !== 'forbidden'
        ? e.message
        : 'Only the user who set up this heartbeat can fire it.';
    }
    return e.message || 'Could not fire the heartbeat.';
  }
  return e instanceof Error ? e.message : 'Could not fire the heartbeat.';
}

/** id (lower case) to a user's name, else email, for heartbeatMakerText. */
export function userNames(
  users: readonly { id: string; displayName?: string | null; email?: string | null }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const u of users) {
    const name = u.displayName?.trim() || u.email?.trim();
    if (name) out.set(u.id.toLowerCase(), name);
  }
  return out;
}
