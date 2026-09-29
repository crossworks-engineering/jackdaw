'use client';

import { useEffect, useState } from 'react';

/**
 * Card density (summaries and tags on or off), remembered per browser under
 * `storageKey`. A display preference, not part of the query: in the URL it
 * would paste into every shared link and says nothing about WHICH items are
 * shown. Off by default: the column is for FINDING an item.
 *
 * Read AFTER mount: `localStorage` does not exist during the server render,
 * so seeding `useState` from it would hydrate-mismatch.
 */
export function useCardDetails(storageKey: string): [boolean, (on: boolean) => void] {
  const [details, setDetails] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === '1') setDetails(true);
    } catch {
      /* private mode / quota: the preference just won't persist */
    }
  }, [storageKey]);
  const change = (on: boolean) => {
    setDetails(on);
    try {
      window.localStorage.setItem(storageKey, on ? '1' : '0');
    } catch {
      /* as above */
    }
  };
  return [details, change];
}
