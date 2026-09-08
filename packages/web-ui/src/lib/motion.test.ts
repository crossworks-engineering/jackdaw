import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, scrollBehavior } from './motion';

/**
 * The half of the reduced-motion fix CSS cannot do. The global clamp in
 * globals.css covers every animation and transition a stylesheet drives; a
 * smooth scroll requested in JavaScript overrides the CSS property instead of
 * deferring to it, so these two functions are what the seven `scrollIntoView`
 * call sites ask.
 */

/** `matchMedia` returning `matches` for exactly the reduced-motion query. */
function stubMatchMedia(reduce: boolean) {
  const matchMedia = vi.fn((q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
  }));
  vi.stubGlobal('window', { matchMedia });
  return matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('is true only when the user asked for reduced motion', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);

    vi.unstubAllGlobals();
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('asks the exact media query, not a near miss', () => {
    const mm = stubMatchMedia(true);
    prefersReducedMotion();
    expect(mm).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  // Read at call time, never cached: an OS toggle (or a tester's emulation)
  // changes the answer under a running tab, and a module constant would stay
  // wrong until reload.
  it('re-reads the setting on every call', () => {
    let reduce = false;
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({ matches: reduce && q.includes('prefers-reduced-motion') }),
    });
    expect(prefersReducedMotion()).toBe(false);
    reduce = true;
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false wherever the question cannot be asked', () => {
    vi.stubGlobal('window', undefined);
    expect(prefersReducedMotion()).toBe(false);

    // An older engine with no matchMedia at all.
    vi.unstubAllGlobals();
    vi.stubGlobal('window', {});
    expect(prefersReducedMotion()).toBe(false);

    // One that throws on a query it does not understand.
    vi.unstubAllGlobals();
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('unsupported');
      },
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('scrollBehavior', () => {
  it('skips the journey, not the destination', () => {
    stubMatchMedia(true);
    expect(scrollBehavior()).toBe('auto');

    vi.unstubAllGlobals();
    stubMatchMedia(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('defaults to smooth when there is no window to ask', () => {
    vi.stubGlobal('window', undefined);
    expect(scrollBehavior()).toBe('smooth');
  });
});
