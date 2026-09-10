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
