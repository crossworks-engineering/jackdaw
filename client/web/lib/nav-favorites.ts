'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NavGroup, NavItem } from '@mantle/web-ui/layout/nav-items';

/**
 * The destinations this owner has starred, pinned to a Favorites group at the
 * top of the sidebar.
 *
 * Stored per BROWSER in localStorage, beside `nav-usage`'s counters and for the
 * same reasons: a personalisation convenience, no server surface, no PII, safe
 * to lose. Jason chose this over a synced account preference — that would need
 * a mantle change, a new preference key and a paired release, for a list of
 * menu shortcuts.
 *
 * ⚠ So favourites do NOT follow you to another machine, another browser, or
 * through a "clear site data". If that becomes the wrong trade, only the two
 * functions below change: the sidebar talks to `useNavFavorites` and knows
 * nothing about where the list lives.
 *
 * ── Why this one is LIVE and `nav-usage` is frozen ─────────────────────────
 * `useGroupHead` computes once per mount on purpose, because a menu that
 * reorders under the cursor moves the row you were aiming at. That reasoning
 * does not apply here and inverting it would be a bug: starring is a DELIBERATE
 * act, and the whole feedback for it is the row appearing in Favorites. So this
 * subscribes, and a star fills and the group updates in the same frame.
 */
const KEY = 'mantle_nav_favorites_v1';

/** Same-tab notification. `storage` only fires in OTHER tabs, so a click would
 *  update localStorage and leave the star in this one unfilled until reload. */
const EVENT = 'mantle:nav-favorites';

/** Just enough of the Storage interface to be faked in a test. The pure half of
 *  this module takes one, so the rules below can be pinned without a DOM. */
export type FavoritesStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The starred hrefs, tolerating anything that is not the shape we wrote.
 *
 * Junk is not hypothetical: this key is user-writable, survives every release,
 * and a throw here would take the whole sidebar down rather than lose a
 * convenience. Non-strings are dropped individually so ONE bad entry cannot
 * discard a list the owner curated.
 */
export function readFavorites(store: FavoritesStore): string[] {
  try {
    const raw = store.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Add or remove one href, returning the new list.
 *
 * New stars APPEND. Ordering by anything cleverer — most used, alphabetical —
 * would move rows the owner placed deliberately, and the point of pinning is
 * that the row stays where it was put.
 */
export function toggleFavoriteIn(store: FavoritesStore, href: string): string[] {
  const next = readFavorites(store);
  const at = next.indexOf(href);
  if (at === -1) next.push(href);
  else next.splice(at, 1);
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — the list just won't persist */
  }
  return next;
}

/**
 * The starred hrefs resolved against the nav list actually being rendered.
 *
 * Resolving rather than storing the items is what keeps a star on a
 * since-retired screen from becoming a permanently-404ing row at the top of the
 * sidebar: the href outlives the route it names, so an href with no live item
 * simply drops out.
 *
 * Favorites is a VIEW, not a place items move to — a starred screen keeps its
 * home row too, exactly as pinning works elsewhere.
 */
export function favoriteItems<I extends NavItem>(
  favorites: string[],
  groups: Array<{ items: I[] }>,
): I[] {
  const byHref = new Map(groups.flatMap((g) => g.items).map((i) => [i.href, i]));
  return favorites.map((href) => byHref.get(href)).filter((i): i is I => i !== undefined);
}

/** Narrowing helper so callers can build the group without repeating the type. */
export type FavoritesGroup = Pick<NavGroup, 'label' | 'items'>;

/**
 * The list, and a toggle.
 *
 * Starts EMPTY rather than reading localStorage during render, and fills in on
 * mount. The server has no localStorage, so seeding from it would make the
 * first client render disagree with the HTML and React would discard the tree
 * with a hydration error. An empty first paint is the honest shared state.
 */
export function useNavFavorites(): {
  favorites: string[];
  isFavorite: (href: string) => boolean;
  toggleFavorite: (href: string) => void;
} {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setFavorites(readFavorites(window.localStorage));
    sync();
    // Both: `storage` for other tabs, the custom event for this one.
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const toggleFavorite = useCallback((href: string) => {
    setFavorites(toggleFavoriteIn(window.localStorage, href));
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);

  const isFavorite = useCallback((href: string) => favorites.includes(href), [favorites]);

  return { favorites, isFavorite, toggleFavorite };
}
