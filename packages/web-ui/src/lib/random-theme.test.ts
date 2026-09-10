import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  RANDOM_THEME_PICK_STORAGE_KEY,
  readRandomPick,
  resolveInitialColorTheme,
  writeRandomPick,
} from './random-theme';

describe('resolveInitialColorTheme', () => {
  it('paints the brain theme when the screensaver is off', () => {
    // The pick is deliberately still on disk here: turning the feature off is
    // what makes it irrelevant, not deleting it.
    expect(
      resolveInitialColorTheme({ stored: 'slate', randomTheme: false, pick: 'amber' }),
    ).toEqual({ theme: 'slate', repaint: false });
  });

  it('paints the visitor pick while the screensaver is on', () => {
    expect(resolveInitialColorTheme({ stored: 'slate', randomTheme: true, pick: 'amber' })).toEqual(
      {
        theme: 'amber',
        repaint: true,
      },
    );
  });

  it('does not repaint when the pick already matches what was rendered', () => {
    expect(resolveInitialColorTheme({ stored: 'amber', randomTheme: true, pick: 'amber' })).toEqual(
      {
        theme: 'amber',
        repaint: false,
      },
    );
  });

  it('falls back to the brain theme when there is no pick yet', () => {
    expect(resolveInitialColorTheme({ stored: 'slate', randomTheme: true, pick: null })).toEqual({
      theme: 'slate',
      repaint: false,
    });
  });

  it('treats an empty stored value as no pick rather than as a theme id', () => {
    expect(resolveInitialColorTheme({ stored: 'slate', randomTheme: true, pick: '' })).toEqual({
      theme: 'slate',
      repaint: false,
    });
  });
});

describe('the pick store', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('round-trips a pick', () => {
    writeRandomPick('amber');
    expect(store.get(RANDOM_THEME_PICK_STORAGE_KEY)).toBe('amber');
    expect(readRandomPick()).toBe('amber');
  });

  it('null forgets the pick', () => {
    writeRandomPick('amber');
    writeRandomPick(null);
    expect(store.has(RANDOM_THEME_PICK_STORAGE_KEY)).toBe(false);
    expect(readRandomPick()).toBeNull();
  });

  it('survives storage being blocked, in both directions', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(() => writeRandomPick('amber')).not.toThrow();
    expect(readRandomPick()).toBeNull();
  });
});
