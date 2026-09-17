/**
 * The guided tour — the pure half.
 *
 * A tour is a script of steps; each step names a route, optionally an anchor
 * on that screen (a `data-tour="…"` attribute), and what to say there. The
 * provider (components/tour) walks the script; this module holds everything
 * about it that needs no DOM, so it can be pinned by tests: which tour starts
 * on its own, what a stored value means, and where the card goes.
 *
 * Tours are a PRODUCT feature, not demo code: any deployment can name one in
 * `MANTLE_TOUR`, and `?tour=<id>` opens one on demand. The public demo is
 * simply the first deployment that does.
 */

export type TourSide = 'right' | 'left' | 'bottom' | 'top';

export type TourStep = {
  /** The screen this step lives on; the provider navigates there. */
  route: string;
  /**
   * The `data-tour` value of the element to spotlight. Absent ⇒ the card sits
   * centred over the screen with nothing highlighted — for a step that is
   * about the screen as a whole.
   */
  target?: string;
  title: string;
  body: string;
  /** Where the card prefers to sit relative to its target. Default: right. */
  side?: TourSide;
};

export type Tour = {
  id: string;
  title: string;
  steps: readonly TourStep[];
};

/** What a browser remembers about a tour, under `mantle_tour:<id>`. */
export type TourMemory = 'done' | 'dismissed';

export const tourStorageKey = (id: string) => `mantle_tour:${id}`;

/** A stored value written by any build of this app, or junk — only the two
 *  words mean anything. */
export function parseTourMemory(raw: string | null): TourMemory | null {
  return raw === 'done' || raw === 'dismissed' ? raw : null;
}

/**
 * Which tour, if any, opens by itself on this page load.
 *
 * `?tour=<id>` in the URL always wins and always starts, even a tour this
 * browser has finished — it is how a link from a marketing page, or a person
 * who wants to see it again, asks for it. Otherwise the deployment's
 * `MANTLE_TOUR` starts ONCE: a browser that finished or dismissed it is not
 * shown it again. An id that names no known tour starts nothing, rather than
 * an empty overlay.
 */
export function decideAutoStart(input: {
  urlTour: string | null;
  envTour: string | null;
  known: (id: string) => boolean;
  remembered: (id: string) => TourMemory | null;
}): string | null {
  const url = input.urlTour?.trim();
  if (url && input.known(url)) return url;
  const env = input.envTour?.trim();
  if (env && input.known(env) && input.remembered(env) === null) return env;
  return null;
}

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Gap between the spotlight and the card, and the card's distance from the
 *  viewport edge. */
export const CARD_GAP = 12;
export const VIEWPORT_MARGIN = 12;

/**
 * Where the card goes: beside its target on the preferred side when that
 * fits, else the first side that does, else — a target so large no side has
 * room, such as the whole content area — centred OVER it, pinned inside the
 * viewport. With no target the card sits in the middle of the screen.
 *
 * Pure so the fallback order can be pinned by a test — a card that lands off
 * screen is a tour nobody can finish, and "it fit on my monitor" is the
 * whole reason to test it rather than eyeball it.
 */
export function placeCard(
  target: Rect | null,
  card: Size,
  viewport: Size,
  preferred: TourSide = 'right',
): { top: number; left: number; side: TourSide | 'center' | 'inside' } {
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - card.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - card.height - VIEWPORT_MARGIN);

  if (!target) {
    return {
      top: clamp((viewport.height - card.height) / 2, VIEWPORT_MARGIN, maxTop),
      left: clamp((viewport.width - card.width) / 2, VIEWPORT_MARGIN, maxLeft),
      side: 'center',
    };
  }

  const order: TourSide[] = [preferred, ...(['right', 'left', 'bottom', 'top'] as const)].filter(
    (s, i, all) => all.indexOf(s) === i,
  );
  const centreY = target.top + target.height / 2 - card.height / 2;
  const centreX = target.left + target.width / 2 - card.width / 2;
  const candidates: Record<TourSide, { top: number; left: number; fits: boolean }> = {
    right: {
      top: centreY,
      left: target.left + target.width + CARD_GAP,
      fits: target.left + target.width + CARD_GAP + card.width + VIEWPORT_MARGIN <= viewport.width,
    },
    left: {
      top: centreY,
      left: target.left - CARD_GAP - card.width,
      fits: target.left - CARD_GAP - card.width >= VIEWPORT_MARGIN,
    },
    bottom: {
      top: target.top + target.height + CARD_GAP,
      left: centreX,
      fits:
        target.top + target.height + CARD_GAP + card.height + VIEWPORT_MARGIN <= viewport.height,
    },
    top: {
      top: target.top - CARD_GAP - card.height,
      left: centreX,
      fits: target.top - CARD_GAP - card.height >= VIEWPORT_MARGIN,
    },
  };
  const side = order.find((s) => candidates[s].fits);
  if (!side) {
    return {
      top: clamp(target.top + target.height / 2 - card.height / 2, VIEWPORT_MARGIN, maxTop),
      left: clamp(centreX, VIEWPORT_MARGIN, maxLeft),
      side: 'inside',
    };
  }
  const c = candidates[side];
  return {
    top: clamp(c.top, VIEWPORT_MARGIN, maxTop),
    left: clamp(c.left, VIEWPORT_MARGIN, maxLeft),
    side,
  };
}

/** The `data-tour` selector for a step's target. */
export const tourSelector = (target: string) => `[data-tour="${target.replace(/"/g, '\\"')}"]`;
