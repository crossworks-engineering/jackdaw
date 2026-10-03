import { describe, expect, it } from 'vitest';
import {
  CARD_GAP,
  VIEWPORT_MARGIN,
  decideAutoStart,
  parseTourMemory,
  placeCard,
  tourRouteToOpen,
  tourSelector,
  tourStepId,
  tourStorageKey,
} from './model';

/**
 * The pure half of the guided tour. The provider around it is React and a
 * DOM; what can be WRONG is the decision to start, the reading of a stored
 * value, and the arithmetic that keeps the card on screen — none of which
 * needs a browser to pin.
 */

describe('parseTourMemory', () => {
  it('reads the two words and nothing else', () => {
    expect(parseTourMemory('done')).toBe('done');
    expect(parseTourMemory('dismissed')).toBe('dismissed');
    expect(parseTourMemory(null)).toBeNull();
    expect(parseTourMemory('')).toBeNull();
    expect(parseTourMemory('DONE')).toBeNull();
    expect(parseTourMemory('{"done":true}')).toBeNull();
  });

  it('keys one entry per tour', () => {
    expect(tourStorageKey('demo')).toBe('mantle_tour:demo');
  });
});

describe('decideAutoStart', () => {
  const known = (id: string) => id === 'demo';
  const firstRoute = (id: string) => (id === 'demo' ? '/' : null);
  const fresh = () => null;
  const base = { known, firstRoute, remembered: fresh, pathname: '/' };

  it('starts the deployment tour once, on its first screen', () => {
    expect(decideAutoStart({ ...base, urlTour: null, envTour: 'demo' })).toBe('demo');
  });

  // A visitor who deep-linked to /pages is not pulled to the dashboard by a
  // tour they did not ask for. Nothing is remembered, so it opens when they
  // do reach the first screen.
  it('waits for the first screen rather than yanking a deep link', () => {
    expect(decideAutoStart({ ...base, urlTour: null, envTour: 'demo', pathname: '/pages' })).toBe(
      null,
    );
    expect(decideAutoStart({ ...base, urlTour: null, envTour: 'demo', pathname: null })).toBe(null);
  });

  it('does not repeat a tour this browser finished or dismissed', () => {
    for (const memory of ['done', 'dismissed'] as const) {
      expect(
        decideAutoStart({ ...base, urlTour: null, envTour: 'demo', remembered: () => memory }),
      ).toBeNull();
    }
  });

  // A link that asks for the tour is a person asking; the memory and the
  // first-screen rule are for the unasked-for case only.
  it('the URL always starts the tour, finished or not, from any screen', () => {
    expect(
      decideAutoStart({
        ...base,
        urlTour: 'demo',
        envTour: null,
        pathname: '/traces',
        remembered: () => 'done',
      }),
    ).toBe('demo');
  });

  it('never opens an empty overlay for an id nothing knows', () => {
    expect(decideAutoStart({ ...base, urlTour: 'nope', envTour: null })).toBeNull();
    expect(decideAutoStart({ ...base, urlTour: null, envTour: 'nope' })).toBeNull();
    // A bad URL id does not fall through to blocking the env tour either.
    expect(decideAutoStart({ ...base, urlTour: 'nope', envTour: 'demo' })).toBe('demo');
  });

  it('treats blanks as absent', () => {
    expect(decideAutoStart({ ...base, urlTour: '  ', envTour: '' })).toBeNull();
  });
});

describe('placeCard', () => {
  const viewport = { width: 1440, height: 900 };
  const card = { width: 320, height: 180 };

  it('centres the card when there is nothing to point at', () => {
    const p = placeCard(null, card, viewport);
    expect(p.side).toBe('center');
    expect(p.left).toBe((1440 - 320) / 2);
    expect(p.top).toBe((900 - 180) / 2);
  });

  it('sits to the right of a rail item, vertically centred on it', () => {
    const target = { top: 300, left: 12, width: 200, height: 36 };
    const p = placeCard(target, card, viewport);
    expect(p.side).toBe('right');
    expect(p.left).toBe(12 + 200 + CARD_GAP);
    expect(p.top).toBe(300 + 18 - 90);
  });

  it('flips to the left when the right edge would leave the viewport', () => {
    const target = { top: 300, left: 1300, width: 120, height: 36 };
    const p = placeCard(target, card, viewport);
    expect(p.side).toBe('left');
    expect(p.left).toBe(1300 - CARD_GAP - 320);
  });

  it('goes below when neither side fits, and above when below does not', () => {
    const narrow = { width: 400, height: 900 };
    const wide = { top: 100, left: 20, width: 360, height: 40 };
    expect(placeCard(wide, card, narrow).side).toBe('bottom');
    const low = { top: 800, left: 20, width: 360, height: 40 };
    expect(placeCard(low, card, narrow).side).toBe('top');
  });

  // The content area is a target too, and it fills the viewport: no side has
  // room, and a card shoved into the bottom-right corner reads as a mistake.
  it('sits centred over a target that leaves no room beside it', () => {
    const main = { top: 0, left: 256, width: 1184, height: 900 };
    const p = placeCard(main, card, viewport, 'left');
    expect(p.side).toBe('inside');
    expect(p.left).toBe(256 + 1184 / 2 - 160);
    expect(p.top).toBe(900 / 2 - 90);
  });

  it('honours a preferred side that fits, and ignores one that does not', () => {
    const target = { top: 300, left: 700, width: 100, height: 36 };
    expect(placeCard(target, card, viewport, 'bottom').side).toBe('bottom');
    const flush = { top: 300, left: 12, width: 100, height: 36 };
    expect(placeCard(flush, card, viewport, 'left').side).toBe('right');
  });

  // The invariant the whole function exists for.
  it('never places the card outside the viewport', () => {
    const cases = [
      { top: -50, left: -50, width: 10, height: 10 },
      { top: 890, left: 1430, width: 300, height: 300 },
      { top: 0, left: 0, width: 1440, height: 900 },
    ];
    for (const target of cases) {
      const p = placeCard(target, card, viewport);
      expect(p.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
      expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
      expect(p.left + card.width).toBeLessThanOrEqual(viewport.width - VIEWPORT_MARGIN);
      expect(p.top + card.height).toBeLessThanOrEqual(viewport.height - VIEWPORT_MARGIN);
    }
  });

  it('degrades rather than throws on a viewport smaller than the card', () => {
    const p = placeCard(null, card, { width: 200, height: 100 });
    expect(p.left).toBe(VIEWPORT_MARGIN);
    expect(p.top).toBe(VIEWPORT_MARGIN);
  });
});

describe('tourSelector', () => {
  it('builds an attribute selector and escapes quotes', () => {
    expect(tourSelector('nav:/notes')).toBe('[data-tour="nav:/notes"]');
    expect(tourSelector('a"b')).toBe('[data-tour="a\\"b"]');
  });
});

describe('tourRouteToOpen', () => {
  const welcome = tourStepId('member', 0);
  const pagesStep = tourStepId('member', 2);
  const at = (pathname: string, opened: string | null, step = welcome, route = '/') =>
    tourRouteToOpen({ step, route, pathname, opened });

  it('goes to the step screen once, as the step opens elsewhere', () => {
    expect(at('/pages', null)).toBe('/');
    expect(at('/', welcome, pagesStep, '/pages')).toBe('/pages');
    // Back to an earlier step is an opening too.
    expect(at('/pages', pagesStep, welcome, '/')).toBe('/');
  });

  it('stays when the step opens on its own screen', () => {
    expect(at('/', null)).toBeNull();
  });

  it('never pulls the person back while the same step stays open', () => {
    // The member bounce (2026-10-03): the Welcome step sat on Home and every
    // click on Pages, Notes or Apps was pushed back to Home.
    expect(at('/pages', welcome)).toBeNull();
    expect(at('/notes', welcome)).toBeNull();
    expect(at('/pages', pagesStep, pagesStep, '/pages')).toBeNull();
    expect(at('/apps', pagesStep, pagesStep, '/pages')).toBeNull();
  });

  it('does nothing with no step open', () => {
    expect(tourRouteToOpen({ step: null, route: null, pathname: '/pages', opened: welcome })).toBe(
      null,
    );
  });

  it('opens the same step again after the tour closed and restarted', () => {
    // Closed: the provider forgets what it opened, so Take the tour from
    // another screen goes to the first step's screen again.
    expect(at('/pages', null)).toBe('/');
  });

  it('keys each step of each tour apart', () => {
    expect(tourStepId('member', 0)).not.toBe(tourStepId('member', 1));
    expect(tourStepId('member', 0)).not.toBe(tourStepId('demo', 0));
  });
});
