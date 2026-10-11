/**
 * Heartbeats on the wire, with the fields workspaces W7a added. A copy of
 * the W7a lines of mantle packages/client-types/src/dto/heartbeats.ts (brain
 * main, v0.239.98) over the published pin. Replace the copy by hand when the
 * pin carries them.
 *
 *  - `createdBy`: the login that set up what the heartbeat does, null when
 *    it is the brain owner's. Only that login (the maker) fires it ("Fire
 *    now" answers 403 for anyone else).
 *  - `stateHidden`: the state is another login's, so it is not sent (`state`
 *    is `{}`); an empty state sent back on an edit leaves it as it is.
 *
 * A fire's `replyText`, `stateBefore`, `stateAfter` and `traceId` are null
 * for anyone but the maker.
 */
import type { HeartbeatDTO as PinnedHeartbeatDTO } from '@mantle/client-types';

export type HeartbeatDTO = PinnedHeartbeatDTO & {
  /** Optional: absent from a brain before W7a (read as the owner's). */
  createdBy?: string | null;
  stateHidden?: boolean;
};

export type { HeartbeatFireSummary } from '@mantle/client-types';
