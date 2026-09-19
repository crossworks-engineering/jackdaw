import { describe, expect, it } from 'vitest';
import { positionAtCaret, type CaretMenuInput } from './caret-menu-position';

// An 800px-tall, 1200px-wide visible area; a 320px-wide menu that wants the
// slash menu's full 352px (22rem), floor 192px (12rem), 8px margins.
const VIEWPORT = 800;
const base = (over: Partial<CaretMenuInput> & { caretTop: number }): CaretMenuInput => ({
  caret: { top: over.caretTop, bottom: over.caretTop + 20, left: 100 },
  menu: { width: 320, height: 352 },
  bounds: { top: 0, bottom: VIEWPORT, left: 0, right: 1200 },
  margin: 8,
  maxHeight: 352,
  minHeight: 192,
  ...over,
});

describe('positionAtCaret', () => {
  it('opens below the caret when the whole menu fits there', () => {
    const p = positionAtCaret(base({ caretTop: 100 }), VIEWPORT);
    expect(p).toMatchObject({ side: 'below', top: 128, bottom: null, maxHeight: 352 });
  });

  it('opens above on the last line of a long page, anchored by its bottom edge', () => {
    const p = positionAtCaret(base({ caretTop: 760 }), VIEWPORT);
    expect(p.side).toBe('above');
    expect(p.top).toBeNull();
    // Bottom edge 8px above the caret: 800 - (760 - 8).
    expect(p.bottom).toBe(48);
    expect(p.maxHeight).toBe(352);
  });

  it('picks the side with MORE room when the menu fits neither (the squashed-menu bug)', () => {
    // Short window: 500px tall, caret at 330. Above 314, below 134: neither
    // holds 352. The old rule stayed below and clamped over the caret.
    const p = positionAtCaret(
      base({ caretTop: 330, bounds: { top: 0, bottom: 500, left: 0, right: 1200 } }),
      500,
    );
    expect(p.side).toBe('above');
    expect(p.maxHeight).toBe(314);
    expect(p.bottom).toBe(500 - (330 - 8));
  });

  it('caps a below-opening menu to the room it has', () => {
    // Above 184, below 264: below wins, capped to 264.
    const p = positionAtCaret(
      base({ caretTop: 200, bounds: { top: 0, bottom: 500, left: 0, right: 1200 } }),
      500,
    );
    expect(p).toMatchObject({ side: 'below', top: 228, maxHeight: 264 });
  });

  it('never caps below the floor, and keeps the floored menu inside the bounds', () => {
    // 300px of visible height, caret mid-way: above 124, below 124.
    const p = positionAtCaret(
      base({ caretTop: 140, bounds: { top: 0, bottom: 300, left: 0, right: 1200 } }),
      300,
    );
    expect(p.side).toBe('below');
    expect(p.maxHeight).toBe(192);
    // 192px tall and 8px off the bottom edge: it overlaps the caret rather
    // than running off-screen.
    expect(p.top).toBe(300 - 8 - 192);
  });

  it('measures against the bounds, not the window (bottom chrome, on-screen keyboard)', () => {
    // The window is 800 tall but the editor pane ends at 600. Caret at 400:
    // below has 164 inside the pane (it would be 364 against the window).
    const p = positionAtCaret(
      base({ caretTop: 400, bounds: { top: 0, bottom: 600, left: 0, right: 1200 } }),
      VIEWPORT,
    );
    expect(p.side).toBe('above');
    expect(p.maxHeight).toBe(352);
    expect(p.bottom).toBe(VIEWPORT - (400 - 8));
  });

  it('stays on the side it opened on while the filter shrinks the list', () => {
    // Opened above at the foot of the page. The filter narrows the list to
    // 80px, which would now fit below, but hopping across the caret mid-word
    // is worse than staying put.
    const p = positionAtCaret(
      base({ caretTop: 700, menu: { width: 320, height: 80 }, current: 'above' }),
      VIEWPORT,
    );
    expect(p.side).toBe('above');
    expect(p.bottom).toBe(VIEWPORT - (700 - 8));
  });

  it('leaves its side once it no longer fits there and the other side is roomier', () => {
    // First placement ran before React committed (height 0) and said "below".
    // The real height arrives: below has 64, above has 684.
    const p = positionAtCaret(base({ caretTop: 700, current: 'below' }), VIEWPORT);
    expect(p.side).toBe('above');
  });

  it('clamps horizontally inside the bounds', () => {
    const right = positionAtCaret(
      base({ caretTop: 100, caret: { top: 100, bottom: 120, left: 1100 } }),
      VIEWPORT,
    );
    expect(right.left).toBe(1200 - 320 - 8);
    const left = positionAtCaret(
      base({ caretTop: 100, caret: { top: 100, bottom: 120, left: -40 } }),
      VIEWPORT,
    );
    expect(left.left).toBe(8);
  });

  it('respects a visual viewport that does not start at the window origin', () => {
    // Pinch-zoomed / keyboard-shifted: visible area is 200..700.
    const p = positionAtCaret(
      base({ caretTop: 640, bounds: { top: 200, bottom: 700, left: 0, right: 1200 } }),
      VIEWPORT,
    );
    expect(p.side).toBe('above');
    // Above: 640 - 8 - (200 + 8) = 424, so the full menu fits.
    expect(p.maxHeight).toBe(352);
  });
});
