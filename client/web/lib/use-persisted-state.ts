'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A preference that survives a reload, read WITHOUT breaking hydration.
 *
 * The pattern this replaces is everywhere in the app and is a real bug, not a
 * style question:
 *
 *     useState(() => localStorage.getItem('files:view') ?? 'list')
 *
 * The root layout is `force-dynamic`, so that component renders on the server —
 * where there is no `localStorage` — and again on the client, where there is.
 * Two different first renders is precisely what a hydration mismatch is: React
 * keeps the server's markup and the client's state, and the screen shows a
 * value nobody chose until something else happens to re-render it. The lazy
 * initialiser is also unguarded, and `localStorage` ACCESS (not just its
 * contents) throws in a browser set to block site data — which took the whole
 * member surface to the error page once already.
 *
 * So: render the fallback on both sides, then adopt the stored value in an
 * effect, which only ever runs on the client and only after hydration has
 * matched. The cost is one extra render for anyone who has a stored preference;
 * the alternative is a screen that is occasionally wrong and a crash in a
 * privacy-hardened browser.
 */

/**
 * Decide what a stored string means — the whole of the logic, kept pure so it
 * can be tested without a DOM.
 *
 * `parse` returns `null` for anything it does not recognise, which covers a
 * value written by an older build, a hand-edited one, and the `null` that
 * comes back when the key is absent.
 */
export function readStored<T>(raw: string | null, parse: (s: string) => T | null, fallback: T): T {
  if (raw === null) return fallback;
  const parsed = parse(raw);
  return parsed === null ? fallback : parsed;
}

/** One of a fixed set of strings — the common case, and its own parser. */
export function oneOf<T extends string>(...allowed: readonly T[]) {
  return (s: string): T | null => (allowed.includes(s as T) ? (s as T) : null);
}

export function usePersistedState<T>(
  key: string,
  fallback: T,
  parse: (s: string) => T | null,
  serialise: (v: T) => string = String,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  // After hydration, not during it. Storage access itself can throw.
  useEffect(() => {
    try {
      const stored = readStored(window.localStorage.getItem(key), parse, fallback);
      if (stored !== fallback) setValue(stored);
    } catch {
      /* no storage — the fallback stands, which is a working screen */
    }
    // Deliberately once per key: re-running on a new `parse` identity would
    // stamp the stored value back over a choice the user just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, serialise(v));
      } catch {
        /* private mode — the choice holds for this session and no longer */
      }
    },
    [key, serialise],
  );

  return [value, set];
}
