import { describe, expect, it } from 'vitest';
import {
  CARD_GAP,
  VIEWPORT_MARGIN,
  decideAutoStart,
  parseTourMemory,
  placeCard,
  tourSelector,
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
  const fresh = () => null;

  it('starts the deployment tour once', () => {
    expect(decideAutoStart({ urlTour: null, envTour: 'demo', known, remembered: fresh })).toBe(
      'demo',
    );
  });

  it('does not repeat a tour this browser finished or dismissed', () => {
    for (const memory of ['done', 'dismissed'] as const) {
      expect(
        decideAutoStart({ urlTour: null, envTour: 'demo', known, remembered: () => memory }),
      ).toBeNull();
    }
  });

  // A link that asks for the tour is a person asking; the memory is for the
  // unasked-for case only.
  it('the URL always starts the tour, finished or not', () => {
    expect(
      decideAutoStart({ urlTour: 'demo', envTour: null, known, remembered: () => 'done' }),
    ).toBe('demo');
  });

  it('never opens an empty overlay for an id nothing knows', () => {
    expect(
      decideAutoStart({ urlTour: 'nope', envTour: null, known, remembered: fresh }),
    ).toBeNull();
    expect(
      decideAutoStart({ urlTour: null, envTour: 'nope', known, remembered: fresh }),
    ).toBeNull();
    // A bad URL id does not fall through to blocking the env tour either.
    expect(decideAutoStart({ urlTour: 'nope', envTour: 'demo', known, remembered: fresh })).toBe(
      'demo',
    );
  });

  it('treats blanks as absent', () => {
    expect(decideAutoStart({ urlTour: '  ', envTour: '', known, remembered: fresh })).toBeNull();
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
