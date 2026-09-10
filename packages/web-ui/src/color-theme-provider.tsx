'use client';

import * as React from 'react';
import { apiSend } from '@mantle/web-ui/api-fetch';
import {
  RANDOM_THEME_STORAGE_KEY,
  RANDOM_THEME_AT_STORAGE_KEY,
  RANDOM_THEME_INTERVAL_STORAGE_KEY,
  RANDOM_THEME_INTERVAL_MS,
  DEFAULT_COLOR_THEME,
  coerceRandomInterval,
  pickRandomColorTheme,
} from '@mantle/web-ui/lib/themes';
import {
  readRandomPick,
  resolveInitialColorTheme,
  serverThemeWins,
  writeRandomPick,
} from '@mantle/web-ui/lib/random-theme';

type Ctx = {
  colorTheme: string;
  setColorTheme: (id: string) => void;
  /** Apply the server-stored theme (shell load / live sync): paints, never
   *  writes back to the server — the DB copy is already the source it came
   *  from. */
  adoptServerTheme: (id: string) => void;
  /** When on, the color theme reshuffles to a random one every `intervalMs`. */
  randomTheme: boolean;
  setRandomTheme: (on: boolean) => void;
  /** Chosen reshuffle cadence in ms. */
  intervalMs: number;
  setIntervalMs: (ms: number) => void;
  /** Reshuffle right now (one-off) and reset the cadence clock. */
  shuffleNow: () => void;
};

const ColorThemeContext = React.createContext<Ctx | null>(null);

function apply(id: string) {
  if (typeof document === 'undefined') return;
  if (id === DEFAULT_COLOR_THEME) {
    delete document.documentElement.dataset.colorTheme;
  } else {
    document.documentElement.dataset.colorTheme = id;
  }
}

function writeShuffledAt(ms: number) {
  try {
    window.localStorage.setItem(RANDOM_THEME_AT_STORAGE_KEY, String(ms));
  } catch {
    // storage blocked — timer won't survive reloads, no-op
  }
}

function readShuffledAt(): number | null {
  try {
    const raw = window.localStorage.getItem(RANDOM_THEME_AT_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = React.useState(DEFAULT_COLOR_THEME);
  const [randomTheme, setRandomThemeState] = React.useState(false);
  const [intervalMs, setIntervalMsState] = React.useState(RANDOM_THEME_INTERVAL_MS);
  // Bumped by an external one-off shuffle so the timer effect reschedules from
  // the new timestamp (auto-ticks reschedule themselves and don't bump this).
  const [rescheduleNonce, setRescheduleNonce] = React.useState(0);

  // Live ref so the timer can reshuffle relative to the current theme without
  // re-subscribing every time the theme changes.
  const colorThemeRef = React.useRef(colorTheme);
  colorThemeRef.current = colorTheme;

  React.useEffect(() => {
    // Owner-stamped surfaces (/s share pages, member surfaces) lock the theme
    // to the BRAIN OWNER's choice; the provider must not re-derive anything
    // over the lock on hydration.
    if (document.documentElement.dataset.colorThemeOwner === '1') return;
    // The theme itself is SERVER-RENDERED into <html data-color-theme> (the
    // brain's system-wide choice — see @mantle/web-ui/appearance); the DOM is
    // already painted correctly when we mount, so all we do is read the
    // attribute back as initial state. The RANDOM_* toggles are visitor-local
    // behavior, so localStorage remains their home.
    const stored = document.documentElement.dataset.colorTheme || DEFAULT_COLOR_THEME;
    let random = false;
    let interval = RANDOM_THEME_INTERVAL_MS;
    try {
      random = window.localStorage.getItem(RANDOM_THEME_STORAGE_KEY) === '1';
      interval = coerceRandomInterval(
        window.localStorage.getItem(RANDOM_THEME_INTERVAL_STORAGE_KEY),
      );
    } catch {
      // storage blocked — fall back to defaults
    }
    // While the screensaver is on, the visitor's own last pick wins over the
    // brain's stored theme — that pick is local, so unlike the server-rendered
    // attribute it has to be painted here rather than read back.
    const initial = resolveInitialColorTheme({
      stored,
      randomTheme: random,
      pick: readRandomPick(),
    });
    setColorThemeState(initial.theme);
    if (initial.repaint) apply(initial.theme);
    setRandomThemeState(random);
    setIntervalMsState(interval);
  }, []);

  /** Paint a theme. The one place `colorTheme` state and the DOM move together;
   *  every path below is this plus a decision about persistence. */

  const paint = React.useCallback((id: string) => {
    setColorThemeState(id);
    apply(id);
  }, []);

  // Live, because `adoptServerTheme` is called from an effect with no deps and
  // must see whether the screensaver is on RIGHT NOW, not at mount.
  const randomThemeRef = React.useRef(randomTheme);
  randomThemeRef.current = randomTheme;

  const adoptServerTheme = React.useCallback(
    (id: string) => {
      // A visitor running the screensaver has a theme of their own, and the
      // brain's copy must not paint over it. This matters because the shell
      // adopts the server value once `/api/shell` lands — a moment AFTER the
      // provider's first shuffle tick. It used to be harmless only because the
      // shuffle wrote its pick to the server first, so the value coming back
      // was the shuffled one; now that a shuffle is properly local, the server
      // value is the brain's own theme and would undo every tick.
      if (!serverThemeWins({ randomTheme: randomThemeRef.current, pick: readRandomPick() })) return;
      paint(id);
    },
    [paint],
  );

  /** Paint a shuffled theme: visitor-local, never written to the brain. */
  const applyRandomTheme = React.useCallback(
    (id: string) => {
      // `paint`, not `adoptServerTheme` — the guard above would block the very
      // thing it exists to protect.
      paint(id);
      writeRandomPick(id);
    },
    [paint],
  );

  const setColorTheme = React.useCallback(
    (id: string) => {
      paint(id);
      // A deliberate choice ends any local override — otherwise the next load
      // would find a stale shuffle pick and paint over what was just chosen.
      writeRandomPick(null);
      // The DB copy is the source of truth; the next full page load renders it
      // straight into the HTML. Fire-and-forget — a failed write costs nothing
      // but the sync.
      void apiSend('/api/profile/color-theme', 'PUT', { colorTheme: id }).catch(() => {});
    },
    [paint],
  );

  const setRandomTheme = React.useCallback(
    (on: boolean) => {
      setRandomThemeState(on);
      try {
        window.localStorage.setItem(RANDOM_THEME_STORAGE_KEY, on ? '1' : '0');
      } catch {
        // storage blocked — preference won't persist, no-op
      }
      // Enabling jumps to a fresh theme right away (immediate feedback) and
      // starts the clock. Disabling leaves the screen alone — it sticks to the
      // last theme — and only drops the local override behind it.
      if (on) {
        applyRandomTheme(pickRandomColorTheme(colorThemeRef.current));
        writeShuffledAt(Date.now());
      } else {
        // The screen keeps whatever it is showing, but the local override goes
        // with the feature: the next load renders the brain's theme again.
        writeRandomPick(null);
      }
    },
    [applyRandomTheme],
  );

  const setIntervalMs = React.useCallback((ms: number) => {
    setIntervalMsState(ms);
    try {
      window.localStorage.setItem(RANDOM_THEME_INTERVAL_STORAGE_KEY, String(ms));
    } catch {
      // storage blocked — preference won't persist, no-op
    }
  }, []);

  const shuffleNow = React.useCallback(() => {
    applyRandomTheme(pickRandomColorTheme(colorThemeRef.current));
    writeShuffledAt(Date.now());
    setRescheduleNonce((n) => n + 1);
  }, [applyRandomTheme]);

  // While enabled, reshuffle every `intervalMs`. The timestamp is persisted, so
  // the schedule survives reloads and closed periods: on load we catch up if
  // the interval already lapsed, otherwise we wait out the remainder. A reload
  // that isn't yet due keeps the last theme.
  React.useEffect(() => {
    if (!randomTheme) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      applyRandomTheme(pickRandomColorTheme(colorThemeRef.current));
      writeShuffledAt(Date.now());
      timer = setTimeout(tick, intervalMs);
    };
    const last = readShuffledAt() ?? Date.now();
    const remaining = last + intervalMs - Date.now();
    if (remaining <= 0) tick();
    else timer = setTimeout(tick, remaining);
    return () => clearTimeout(timer);
  }, [randomTheme, intervalMs, rescheduleNonce, applyRandomTheme]);

  return (
    <ColorThemeContext.Provider
      value={{
        colorTheme,
        setColorTheme,
        adoptServerTheme,
        randomTheme,
        setRandomTheme,
        intervalMs,
        setIntervalMs,
        shuffleNow,
      }}
    >
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const ctx = React.useContext(ColorThemeContext);
  if (!ctx) throw new Error('useColorTheme must be used within ColorThemeProvider');
  return ctx;
}
