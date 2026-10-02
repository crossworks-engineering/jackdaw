'use client';

import { useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@mantle/web-ui/ui/button';
import { ItemListEmpty, ItemSearch } from '@/components/item-list/item-list-header';
import { syncSelectionParam } from '@/lib/url-sync';

/**
 * A client-side search over a list that arrives whole (Settings > Tools, Tool
 * groups). The text lives in `?q=`, written with `replaceState`, so it
 * survives a trip to another screen and Back, and a link can carry it. No
 * navigation: the list is already loaded, there is nothing to fetch.
 */
export function useListQuery() {
  const searchParams = useSearchParams();
  const [query, setQueryState] = useState(() => searchParams.get('q') ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const setQuery = (value: string) => {
    setQueryState(value);
    syncSelectionParam('q', value.trim() ? value : null);
  };
  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };
  return { query, setQuery, clear, inputRef };
}

/**
 * The search row at the top of the list pane: the kit's `ItemSearch` (its
 * accessible name is the placeholder without the ellipsis, "Search tools") and
 * the "N of M" count, announced politely as it changes.
 */
export function ListSearchBar({
  query,
  onQuery,
  inputRef,
  placeholder,
  shown,
  total,
  noun,
}: {
  query: string;
  onQuery: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  shown: number;
  /** Undefined while the list loads: no count rather than a wrong one. */
  total: number | undefined;
  /** Singular and plural, e.g. `['tool', 'tools']`. */
  noun: readonly [string, string];
}) {
  const word = total === 1 ? noun[0] : noun[1];
  const count =
    total === undefined ? null : query.trim() ? `${shown} of ${total} ${word}` : `${total} ${word}`;
  return (
    <div className="flex items-center gap-2 border-b border-border p-3">
      <ItemSearch ref={inputRef} value={query} onChange={onQuery} placeholder={placeholder} />
      <span role="status" className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/** The empty result: says so, and offers the way back. */
export function ListSearchEmpty({ noun, onClear }: { noun: string; onClear: () => void }) {
  return (
    <ItemListEmpty>
      <p>No {noun} match</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClear}>
        Clear
      </Button>
    </ItemListEmpty>
  );
}
