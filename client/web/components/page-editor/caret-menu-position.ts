/**
 * Where a caret-anchored menu (the `/` block menu, the `@` mention list) goes.
 *
 * Both menus are body-mounted `position: fixed` popups placed by hand, and each
 * had its own copy of the same maths. That maths flipped the menu above the
 * caret only when the WHOLE menu fitted there, and measured against the bare
 * window. So on the last lines of a page in a short window, where the menu fits
 * neither side, it stayed below and was clamped back on-screen over the caret,
 * and a bottom bar the window height knows nothing about could sit on top of it.
 *
 * The rule here instead:
 *
 * 1. **Open on the side with more room**, not the side with full room. Below is
 *    preferred while the menu fits there.
 * 2. **Cap the menu to the side it opened on**, so it is never taller than its
 *    space. `minHeight` is the floor: a sliver is worse than an overlap, so a
 *    menu is never squeezed below it.
 * 3. **Anchor by the bottom edge when opening upward**, so the menu grows and
 *    shrinks away from the caret as the filter narrows instead of jumping.
 * 4. **Stay on the side it opened on** while it still fits there. The height
 *    changes on every keystroke of the filter, and a menu that hops across the
 *    caret mid-word is harder to follow than one that is merely not optimal.
 *
 * `positionAtCaret` is pure (rects and numbers in, a placement out) so it is
 * unit-tested without a DOM. `placeCaretMenu` is the thin DOM half.
 */

export type CaretMenuSide = 'below' | 'above';

export interface CaretMenuBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CaretMenuInput {
  /** The caret (or trigger range) rect, in viewport coordinates. */
  caret: { top: number; bottom: number; left: number };
  /** The popup's width, and the height its content wants before any cap. */
  menu: { width: number; height: number };
  /** The visible area the menu must stay inside, in viewport coordinates. */
  bounds: CaretMenuBounds;
  /** Gap between caret and menu, and between menu and the bounds. */
  margin: number;
  /** The menu's own designed max height (its CSS `max-height`), in px. */
  maxHeight: number;
  /** The floor the cap never goes under, in px. */
  minHeight: number;
  /** The side the menu is already on, if it is open. */
  current?: CaretMenuSide | null;
}

export interface CaretMenuPlacement {
  side: CaretMenuSide;
  left: number;
  /** Set when `side` is `below`: the popup's top edge. */
  top: number | null;
  /** Set when `side` is `above`: distance from the VIEWPORT bottom to the
   *  popup's bottom edge, for `style.bottom` on a fixed element. */
  bottom: number | null;
  /** The height cap to apply to the menu's scroller. */
  maxHeight: number;
}

export function positionAtCaret(input: CaretMenuInput, viewportHeight: number): CaretMenuPlacement {
  const { caret, menu, bounds, margin, current } = input;
  const spaceBelow = Math.max(0, bounds.bottom - margin - (caret.bottom + margin));
  const spaceAbove = Math.max(0, caret.top - margin - (bounds.top + margin));
  const space = (s: CaretMenuSide) => (s === 'below' ? spaceBelow : spaceAbove);

  // The height the menu wants: what it measures now, never more than its design.
  const wanted = Math.min(menu.height, input.maxHeight);

  let side: CaretMenuSide;
  if (current && (wanted <= space(current) || space(current) >= space(other(current)))) {
    side = current;
  } else if (wanted <= spaceBelow || spaceBelow >= spaceAbove) {
    side = 'below';
  } else {
    side = 'above';
  }

  const floor = Math.min(input.minHeight, input.maxHeight);
  const maxHeight = Math.round(Math.max(floor, Math.min(input.maxHeight, space(side))));

  const left = Math.round(
    Math.max(bounds.left + margin, Math.min(caret.left, bounds.right - menu.width - margin)),
  );

  if (side === 'below') {
    // The floor can make the menu taller than its space. Keep it inside the
    // bounds rather than let it run off the bottom, at the cost of overlapping
    // the caret: off-screen rows are what let arrow-key scrollIntoView yank the
    // whole page.
    const height = Math.min(wanted, maxHeight);
    const top = Math.max(
      bounds.top + margin,
      Math.min(caret.bottom + margin, bounds.bottom - margin - height),
    );
    return { side, left, top: Math.round(top), bottom: null, maxHeight };
  }

  const height = Math.min(wanted, maxHeight);
  // Bottom edge sits `margin` above the caret, pushed down only if the floor
  // would otherwise carry the top edge out of the bounds.
  const bottomEdge = Math.max(caret.top - margin, bounds.top + margin + height);
  return {
    side,
    left,
    top: null,
    bottom: Math.round(viewportHeight - bottomEdge),
    maxHeight,
  };
}

function other(side: CaretMenuSide): CaretMenuSide {
  return side === 'below' ? 'above' : 'below';
}

/** The CSS variable the menu's scroller reads its cap from. */
export const CARET_MENU_MAX_HEIGHT_VAR = '--caret-menu-max-h';

/** Marks the menu's scrolling element, so its natural height can be measured.
 *  The popup's direct child is ReactRenderer's wrapper, not the scroller. */
export const CARET_MENU_SCROLLER_ATTR = 'data-caret-menu-scroller';

/**
 * The area a caret menu may occupy: the visual viewport (which excludes an
 * on-screen keyboard and follows pinch-zoom, unlike `innerHeight`), with its
 * bottom pulled up to the editor's scroll pane. The caret lives in that pane, so
 * anything below the pane's bottom edge is app chrome the menu would sit under.
 */
export function caretMenuBounds(editorDom: HTMLElement | null): CaretMenuBounds {
  const vv = window.visualViewport;
  const bounds: CaretMenuBounds = {
    top: vv?.offsetTop ?? 0,
    left: vv?.offsetLeft ?? 0,
    bottom: (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight),
    right: (vv?.offsetLeft ?? 0) + (vv?.width ?? window.innerWidth),
  };
  for (let el = editorDom?.parentElement ?? null; el; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      bounds.bottom = Math.min(bounds.bottom, el.getBoundingClientRect().bottom);
      break;
    }
  }
  return bounds;
}

/**
 * Measure, decide, and write the placement onto a fixed popup. Returns the side
 * so the caller can hand it back as `current` on the next call.
 */
export function placeCaretMenu(
  popup: HTMLElement,
  caret: DOMRect,
  opts: {
    editorDom: HTMLElement | null;
    margin: number;
    maxHeight: number;
    minHeight: number;
    current: CaretMenuSide | null;
  },
): CaretMenuSide {
  // The menu's NATURAL height, not its rendered one: once the scroller is
  // capped its box reports the cap, and deciding from that would keep a menu
  // squeezed below the caret when the full list fits above it.
  const scroller = popup.querySelector<HTMLElement>(`[${CARET_MENU_SCROLLER_ATTR}]`);
  const natural = scroller
    ? scroller.scrollHeight + (scroller.offsetHeight - scroller.clientHeight)
    : popup.offsetHeight;
  const placement = positionAtCaret(
    {
      caret,
      menu: { width: popup.offsetWidth, height: natural },
      bounds: caretMenuBounds(opts.editorDom),
      margin: opts.margin,
      maxHeight: opts.maxHeight,
      minHeight: opts.minHeight,
      current: opts.current,
    },
    window.innerHeight,
  );
  popup.style.setProperty(CARET_MENU_MAX_HEIGHT_VAR, `${placement.maxHeight}px`);
  popup.style.left = `${placement.left}px`;
  popup.style.top = placement.top === null ? 'auto' : `${placement.top}px`;
  popup.style.bottom = placement.bottom === null ? 'auto' : `${placement.bottom}px`;
  return placement.side;
}

/** rem to px against the live root size, so the caps follow the interface-size setting. */
export function remToPx(rem: number): number {
  return rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}
