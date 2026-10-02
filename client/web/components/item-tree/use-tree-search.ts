'use client';

import { useSearchParams } from 'next/navigation';
import { useUrlSearchBox } from '@/lib/url-search-box';
import { syncSelectionParam } from '@/lib/url-sync';

/** The tree's search text in a URL: `?q=`, trimmed; none is the empty search. */
export function treeSearchOf(params: Pick<URLSearchParams, 'get'>): string {
  return params.get('q')?.trim() ?? '';
}

/**
 * Write the tree's search into `?q=` with `replaceState`: no navigation and
 * no history entry per search, and every other param (view, status,
 * selected, folder) stays as it is. The empty search removes `q`.
 */
export function writeTreeSearch(value: string | null): void {
  syncSelectionParam('q', value || null);
}

/**
 * The search box of an item tree, kept in the URL (`?q=`). A link or a
 * bookmark with `?q=` opens the tree filtered; a reload, Back to the screen,
 * or a switch to a view that reads `?q=` itself (the Tasks Board, Archived,
 * a member's list) keeps the text. Typing goes into the URL after a pause
 * (`useUrlSearchBox`), and the box follows the URL when it moves any other
 * way. Every screen that renders `ItemTree` gets its `query` from here.
 */
export function useTreeSearch(): [string, (value: string) => void] {
  const searchParams = useSearchParams();
  return useUrlSearchBox(treeSearchOf(searchParams), writeTreeSearch);
}
