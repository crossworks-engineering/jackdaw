'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A list's search box that lives in the URL (`?q=`): typing goes into the
 * URL after a pause, and the URL comes back into the box when it changes
 * any other way (audit U9). Before, the box was seeded once: Back after a
 * search took `q` out of the URL, the box still said the old words, and a
 * moment later it pushed them back, so Back looked broken.
 *
 * `searchBoxOnUrl` is the rule, pinned by url-search-box.test.ts: a new `q`
 * that is the value this box just pushed is its own echo (the box keeps
 * what was typed since); any other is the URL moving (Back, Forward, a
 * link), and the box follows it.
 */
export function searchBoxOnUrl(q: string, pushed: string | null): { follow: boolean } {
  return { follow: pushed === null || q !== pushed };
}

/** How long typing pauses before the words go into the URL. */
export const SEARCH_DEBOUNCE_MS = 350;

export function useUrlSearchBox(
  q: string,
  push: (q: string | null) => void,
): [string, (value: string) => void] {
  const [input, setInput] = useState(q);
  // The last value this box pushed, until the URL answers with it.
  const pushed = useRef<string | null>(null);
  const seen = useRef(q);
  const pushRef = useRef(push);
  pushRef.current = push;

  // The URL moved: follow it, unless it is this box's own push arriving.
  useEffect(() => {
    if (q === seen.current) return;
    seen.current = q;
    const { follow } = searchBoxOnUrl(q, pushed.current);
    pushed.current = null;
    if (follow) setInput(q);
  }, [q]);

  // Typing: into the URL after a pause (the page resets there).
  useEffect(() => {
    const next = input.trim();
    if (next === q) return;
    const t = setTimeout(() => {
      pushed.current = next;
      pushRef.current(next || null);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, q]);

  return [input, setInput];
}
