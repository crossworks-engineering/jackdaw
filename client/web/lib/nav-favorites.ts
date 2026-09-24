'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { NavGroup, NavItem } from '@mantle/web-ui/layout/nav-items';

/**
 * The destinations this owner has starred, pinned to a Favorites group at the
 * top of the sidebar.
 *
 * Stored on the LOGIN's profile (PUT /api/profile/nav-favorites, read back in
 * GET /api/shell as `navFavorites`), so favourites follow the person to
 * another browser, another machine and the desktop app. They used to live in
 * this browser's localStorage only; the first load against a brain that
 * stores them moves that list up once (see `useNavFavorites`).
 *
 * A brain on an older release doesn't send `navFavorites` at all. Against one
 * of those this falls back to localStorage exactly as before, which is why the
 * storage half below is still here.
 *
 * ── Why this one is LIVE ──────────────────────────────────────────────────
 * The nav's old usage ranking deliberately froze per mount, because a menu that
 * reorders under the cursor moves the row you were aiming at. (That ranking is
 * gone — it fed the group fold, which Jason removed.) The reasoning does not
 * transfer here, and copying it would be a bug: starring is a DELIBERATE act,
 * and the whole feedback for it is the row appearing under Favorites. So a star
 * fills and the group updates in the same frame (optimistically, then saved).
 */
const KEY = 'mantle_nav_favorites_v1';

/** Set once this browser's local list has been moved to the server. */
const MIGRATED_KEY = 'mantle_nav_favorites_migrated_v1';

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

/** Toggle one href in a list (pure; new stars append, see toggleFavoriteIn). */
export function toggledList(list: readonly string[], href: string): string[] {
  return list.includes(href) ? list.filter((h) => h !== href) : [...list, href];
}

type ShellFavorites = { navFavorites?: string[] };

/**
 * The list, and a toggle.
 *
 * Reads the shell query AppShell already runs (same key, so no second
 * request). Until it lands the list is EMPTY, the honest shared state for the
 * first paint; the server has no localStorage and the shell has no data yet.
 */
export function useNavFavorites(): {
  favorites: string[];
  isFavorite: (href: string) => boolean;
  toggleFavorite: (href: string) => void;
} {
  const qc = useQueryClient();
  const toast = useToast();
  const shell = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<ShellFavorites>('/api/shell'),
    staleTime: Infinity,
    select: (d: ShellFavorites) => d.navFavorites,
  });
  const loaded = shell.isSuccess;
  const server = shell.data; // undefined once loaded ⇒ a brain that predates this
  const legacy = loaded && server === undefined;

  // Legacy path: this browser's localStorage, live across tabs, as before.
  const [local, setLocal] = useState<string[]>([]);
  useEffect(() => {
    if (!legacy) return;
    const sync = () => setLocal(readFavorites(window.localStorage));
    sync();
    // Both: `storage` for other tabs, the custom event for this one.
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, [legacy]);

  const save = useCallback(
    async (next: string[], prev: string[]) => {
      qc.setQueryData<ShellFavorites>(['shell'], (d) => (d ? { ...d, navFavorites: next } : d));
      try {
        const res = await apiSend<{ navFavorites: string[] }>('/api/profile/nav-favorites', 'PUT', {
          navFavorites: next,
        });
        qc.setQueryData<ShellFavorites>(['shell'], (d) =>
          d ? { ...d, navFavorites: res.navFavorites } : d,
        );
      } catch {
        qc.setQueryData<ShellFavorites>(['shell'], (d) => (d ? { ...d, navFavorites: prev } : d));
        toast.error('Could not save your favorites');
      }
    },
    [qc, toast],
  );

  // One-time move of a pre-sync local list up to the profile. Only into an
  // EMPTY server list: if this login already has favourites (starred on
  // another device), those win and the stale local copy is just retired.
  useEffect(() => {
    if (!loaded || server === undefined) return;
    try {
      if (window.localStorage.getItem(MIGRATED_KEY)) return;
      const localList = readFavorites(window.localStorage);
      window.localStorage.setItem(MIGRATED_KEY, '1');
      if (localList.length > 0 && server.length === 0) void save(localList, server);
    } catch {
      /* private mode: nothing stored locally to move */
    }
  }, [loaded, server, save]);

  const favorites = useMemo(() => (legacy ? local : (server ?? [])), [legacy, local, server]);

  const toggleFavorite = useCallback(
    (href: string) => {
      if (legacy) {
        setLocal(toggleFavoriteIn(window.localStorage, href));
        window.dispatchEvent(new CustomEvent(EVENT));
        return;
      }
      if (server === undefined) return; // not loaded yet
      void save(toggledList(server, href), server);
    },
    [legacy, server, save],
  );

  const isFavorite = useCallback((href: string) => favorites.includes(href), [favorites]);

  return { favorites, isFavorite, toggleFavorite };
}
