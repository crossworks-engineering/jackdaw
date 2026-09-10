/**
 * The pure decisions behind the assistant thread's live behaviour: where the
 * scroller should sit, what a page of older messages adds, and where the
 * composer's draft is kept.
 *
 * None of this is about rendering. It was inline in `assistant-client.tsx` —
 * arithmetic in the middle of effects and callbacks, which is the one place a
 * mistake is both easy to make and impossible to assert against. The component
 * still owns every effect and every ref; it just asks these functions what the
 * answer is (structure pass, phase 2).
 *
 * Sibling: `assistant-turns.ts`, the pure layer for the message/turn shapes.
 */
import { type Message } from './assistant-turns';

/**
 * How close to the bottom still counts as "at the bottom".
 *
 * Small on purpose: a deliberate scroll-up must un-stick the view, while
 * sub-pixel rounding — which fractional device pixel ratios produce on every
 * resize — must not.
 */
export const NEAR_BOTTOM_PX = 24;

/** Where the composer draft is mirrored, per agent. An agent switch remounts
 *  the component by design, so the key is fixed for a mount and each agent
 *  keeps its own half-typed message. */
export function draftStorageKey(agentSlug?: string | null): string {
  return `mantle_assistant_draft:${agentSlug ?? 'default'}`;
}

/** The sticky share-location opt-in. A module constant rather than a local:
 *  declared in the render body it was rebuilt every render, and a storage key
 *  that can vary per render is a bug waiting for someone to make it vary. */
export const SHARE_LOCATION_KEY = 'mantle_assistant_share_location';

/** Stored as '1'/'0'. Anything else — an older build, a hand-edited value,
 *  or the `null` of an absent key — is not a choice, so the fallback stands. */
export function parseShareLocation(raw: string): boolean | null {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function serialiseShareLocation(on: boolean): string {
  return on ? '1' : '0';
}

/** The scroller geometry these functions need — the three numbers every
 *  scrollable element reports, named so a test needs no DOM. */
export type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

/**
 * Is the reader parked at the bottom, i.e. should new content follow?
 *
 * The moment this goes false the thread stops yanking the reader down and
 * offers the jump button instead.
 */
export function isNearBottom(m: ScrollMetrics, threshold: number = NEAR_BOTTOM_PX): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= threshold;
}

/**
 * After older messages are prepended, where must `scrollTop` go so the reader
 * does not move at all?
 *
 * The content above them grew by `newHeight - prevHeight`, so the same pixels
 * are now that much further down. Getting this backwards does not throw — it
 * teleports the reader, which is exactly the kind of bug that survives review.
 */
export function restoredScrollTop(
  prev: { prevHeight: number; prevTop: number },
  newHeight: number,
): number {
  return newHeight - prev.prevHeight + prev.prevTop;
}

/**
 * Fold a fetched page of older messages into the thread.
 *
 * Two decisions, both of which have a wrong answer that looks fine on screen:
 * which rows are actually new (the server can return a row already held — the
 * boundary row of the previous page, or one that arrived by another channel
 * since), and whether there is more history behind this page. A short page is
 * the end; a full one is not, even if every row in it turns out to be a
 * duplicate — that says the window overlapped, not that history ran out.
 */
export function mergeOlder(
  existing: Message[],
  older: Message[],
  pageSize: number,
): { fresh: Message[]; hasMore: boolean } {
  const have = new Set(existing.map((m) => m.id));
  return {
    fresh: older.filter((m) => !have.has(m.id)),
    hasMore: older.length >= pageSize,
  };
}

/**
 * Does this attachment get an inline object-URL preview?
 *
 * Images do; documents render as a name/size chip. The caller mints and revokes
 * the URL — this only decides. Kept separate because the leak is on the other
 * side: every path that replaces or clears the attachment must revoke the URL
 * it is dropping.
 */
export function wantsPreviewUrl(file: File | null): file is File {
  return file !== null && file.type.startsWith('image/');
}

/**
 * "A turn settles exactly once."
 *
 * A finished turn has TWO independent announcers: the live stream's terminal
 * `done`/`error` phase, and the 3-second safety poll that exists precisely
 * because that phase can be missed (NOTIFY has no backlog, so a reconnect
 * mid-turn drops it). Either may legitimately arrive first, and on a healthy
 * turn both arrive — the poll is a backup, not an alternative.
 *
 * That was fine while the guard was `pendingTurnRef`, right up until settling
 * became asynchronous. `reconcileDone` awaits a full `/messages` round-trip
 * before it clears that ref, so for the length of one network call both
 * announcers still see a live pending turn and both reconcile it. The effect
 * that watches the stream phase can also re-enter on its own, since any change
 * in its callback identities re-runs its body while the phase is still 'done'.
 *
 * The guard has to be claimed SYNCHRONOUSLY, before the first await — which is
 * the whole reason this is a closure and not a boolean somewhere. Keyed by the
 * turn rather than a flag, so it needs no resetting between turns and cannot
 * strand the next one if a settle throws.
 */
export function createTurnSettleGuard() {
  let settled: string | null = null;
  return {
    /** True for the first caller to claim this turn; false for every other. */
    claim(turnId: string): boolean {
      if (settled === turnId) return false;
      settled = turnId;
      return true;
    },
    /** Which turn this guard has settled, if any. For assertions. */
    settledTurn(): string | null {
      return settled;
    },
  };
}
