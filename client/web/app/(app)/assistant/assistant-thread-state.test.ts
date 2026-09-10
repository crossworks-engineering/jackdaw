import { describe, expect, it } from 'vitest';

import {
  NEAR_BOTTOM_PX,
  draftStorageKey,
  isNearBottom,
  mergeOlder,
  restoredScrollTop,
  wantsPreviewUrl,
} from './assistant-thread-state';
import { type Message } from './assistant-turns';

/**
 * Every function here was inline in a callback or an effect, where none of it
 * could be asserted against. None of these failures throw: the scroll ones
 * teleport the reader, the paging ones duplicate or hide messages, and all of
 * them look plausible in a screenshot.
 */

const msg = (id: string): Message => ({
  id,
  direction: 'inbound',
  text: id,
  createdAt: '2026-09-10T08:00:00.000Z',
});

describe('isNearBottom', () => {
  it('is true when the scroller is exactly at the bottom', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 200 })).toBe(true);
  });

  it('tolerates sub-pixel rounding, which a resize produces on its own', () => {
    // The reader did not scroll; a fractional device pixel ratio did this. If
    // this un-stuck the view, the thread would stop following mid-stream.
    expect(isNearBottom({ scrollHeight: 1000.4, scrollTop: 800, clientHeight: 200 })).toBe(true);
  });

  it('un-sticks on a deliberate scroll up', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 200 })).toBe(false);
  });

  it('treats the threshold itself as still at the bottom', () => {
    const atEdge = { scrollHeight: 1000, scrollTop: 800 - NEAR_BOTTOM_PX, clientHeight: 200 };
    expect(isNearBottom(atEdge)).toBe(true);
    // One pixel past it is a real scroll.
    expect(isNearBottom({ ...atEdge, scrollTop: atEdge.scrollTop - 1 })).toBe(false);
  });

  it('is true for a thread too short to scroll', () => {
    // Empty or one-turn threads: scrollHeight equals clientHeight, and new
    // content must still follow.
    expect(isNearBottom({ scrollHeight: 200, scrollTop: 0, clientHeight: 200 })).toBe(true);
  });
});

describe('restoredScrollTop', () => {
  it('holds the reader still when older messages are prepended above them', () => {
    // 600px of history arrived above the viewport; the same content is now
    // 600px further down, so scrollTop must grow by exactly that.
    expect(restoredScrollTop({ prevHeight: 1000, prevTop: 300 }, 1600)).toBe(900);
  });

  it('is a no-op when the prepend added nothing', () => {
    expect(restoredScrollTop({ prevHeight: 1000, prevTop: 300 }, 1000)).toBe(300);
  });

  it('keeps a reader parked at the very top pinned to the seam', () => {
    // scrollTop 0 before the prepend means they were at the oldest message;
    // afterwards they should sit exactly where it now begins, not at 0.
    expect(restoredScrollTop({ prevHeight: 1000, prevTop: 0 }, 1600)).toBe(600);
  });

  it('grows with the prepend rather than shrinking — the sign that inverts', () => {
    // Guards the direction specifically: the transposed version
    // (prevHeight - newHeight + prevTop) yields -300 here, which clamps to the
    // top and looks like "it jumped to the beginning".
    const restored = restoredScrollTop({ prevHeight: 1000, prevTop: 300 }, 1600);
    expect(restored).toBeGreaterThan(300);
  });
});

describe('mergeOlder', () => {
  const PAGE = 3;

  it('adds a clean page of history', () => {
    const result = mergeOlder([msg('c')], [msg('a'), msg('b')], PAGE);
    expect(result.fresh.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('drops rows already in the thread', () => {
    // The boundary row comes back on the next page, and anything that arrived
    // by another channel meanwhile is held twice. Either would render a
    // duplicate turn with a duplicate React key.
    const result = mergeOlder([msg('b'), msg('c')], [msg('a'), msg('b')], PAGE);
    expect(result.fresh.map((m) => m.id)).toEqual(['a']);
  });

  it('reports no more history on a short page', () => {
    expect(mergeOlder([], [msg('a')], PAGE).hasMore).toBe(false);
  });

  it('reports more history on a full page', () => {
    expect(mergeOlder([], [msg('a'), msg('b'), msg('c')], PAGE).hasMore).toBe(true);
  });

  it('does NOT call a full page of duplicates the end of history', () => {
    // The trap: every row was already held, so `fresh` is empty — but a FULL
    // page means the window overlapped, not that history ran out. Deciding on
    // `fresh.length` here would strand the reader with older turns unreachable.
    const existing = [msg('a'), msg('b'), msg('c')];
    const result = mergeOlder(existing, [msg('a'), msg('b'), msg('c')], PAGE);
    expect(result.fresh).toEqual([]);
    expect(result.hasMore).toBe(true);
  });

  it('handles an empty response', () => {
    expect(mergeOlder([msg('a')], [], PAGE)).toEqual({ fresh: [], hasMore: false });
  });

  it('preserves the order the server sent', () => {
    const result = mergeOlder([], [msg('a'), msg('b'), msg('c')], PAGE);
    expect(result.fresh.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('draftStorageKey', () => {
  it('gives each agent its own half-typed message', () => {
    expect(draftStorageKey('research')).not.toBe(draftStorageKey('ops'));
  });

  it('falls back to one shared key when no agent is named', () => {
    expect(draftStorageKey()).toBe(draftStorageKey(null));
    expect(draftStorageKey(undefined)).toContain('default');
  });

  it('is stable for the same agent, so a remount finds the draft again', () => {
    expect(draftStorageKey('research')).toBe(draftStorageKey('research'));
  });
});

describe('wantsPreviewUrl', () => {
  const file = (type: string) => new File(['x'], 'f', { type });

  it('previews an image inline', () => {
    expect(wantsPreviewUrl(file('image/png'))).toBe(true);
    expect(wantsPreviewUrl(file('image/svg+xml'))).toBe(true);
  });

  it('does not mint a URL for a document, which renders as a chip', () => {
    // Minting one here would leak it: the chip path never revokes.
    expect(wantsPreviewUrl(file('application/pdf'))).toBe(false);
    expect(wantsPreviewUrl(file('text/plain'))).toBe(false);
  });

  it('handles a cleared attachment', () => {
    expect(wantsPreviewUrl(null)).toBe(false);
  });

  it('does not treat a merely image-ish mime as an image', () => {
    // `startsWith` on the full type, so nothing that only mentions "image"
    // downstream of the slash slips through.
    expect(wantsPreviewUrl(file('application/image-manifest'))).toBe(false);
  });
});
