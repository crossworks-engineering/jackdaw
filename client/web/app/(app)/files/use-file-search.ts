'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { FileSearchHit } from './files-shared';

/**
 * The left pane's search: ONE input, two behaviours.
 *
 * The tree filters instantly on every keystroke — pure client work, the whole
 * tree is already here — while content search fires debounced against
 * /api/search, which ranks by meaning rather than filename, so a
 * metadata-only file matches on its name-spine.
 */

/** Below this the input is treated as "not searching yet": one or two
 *  characters match most of a brain and the debounce would fire on every
 *  keystroke of a word someone is still typing. */
export const MIN_QUERY = 2;

/** Is this query long enough to search on? Trimmed, because a space is not a
 *  search and the input keeps whatever was typed. */
export function isSearchActive(query: string): boolean {
  return query.trim().length >= MIN_QUERY;
}

export function searchUrl(query: string): string {
  return `/api/search?q=${encodeURIComponent(query.trim())}&branch=files&limit=30`;
}

/** Folders surface through the filtered tree, so the results list is files. */
export function fileHitsOnly(results: FileSearchHit[]): FileSearchHit[] {
  return results.filter((r) => r.type === 'file');
}

export type FileSearch = {
  query: string;
  setQuery: (q: string) => void;
  /** Null until a search has run — distinct from `[]`, which means "ran, found
   *  nothing" and is what the empty state keys off. */
  hits: FileSearchHit[] | null;
  searching: boolean;
  active: boolean;
};

export function useFileSearch(): FileSearch {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FileSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Which search is current. Clearing the debounce timer cancels a request
  // that has not started, but not one already in flight — so a slow answer for
  // "abc" could land after a fast one for "abcd" and put the wrong results on
  // screen. The generation is checked before anything is published.
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    if (!isSearchActive(query)) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ results: FileSearchHit[] }>(searchUrl(query));
        if (generation.current !== mine) return;
        setHits(fileHitsOnly(res.results));
      } catch {
        if (generation.current !== mine) return;
        setHits([]);
      } finally {
        if (generation.current === mine) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return { query, setQuery, hits, searching, active: isSearchActive(query) };
}
