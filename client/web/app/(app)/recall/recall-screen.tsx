'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { recallScreenOf, recallV2Of } from '@/lib/recall-v2';
import { RecallClient, type RecallTab } from './recall-client';
import { RecallV2Client, type RecallV2View } from './v2/recall-v2-client';

/**
 * Which Recall screen this brain gets. A brain that says `features.recallV2`
 * in /api/shell can author native maps, and gets the v2 editor; an older one
 * sends no `features` at all and keeps the v1 page-built screen unchanged.
 * Branch on the capability, never on a version number.
 *
 * Reads the shell the app shell already fetched (same key; `staleTime:
 * Infinity` so this never adds a request of its own, but it still fetches if
 * the cache is somehow empty rather than spinning forever). It waits for the
 * answer rather than guessing: rendering v1 first and then swapping to v2
 * would flash the wrong screen. A shell that never answered reads as an older
 * brain; a failed refetch keeps the answer it had (see recallScreenOf).
 */
export function RecallScreen({
  selected,
  view,
  card,
  q,
  page,
}: {
  selected: string | null;
  view: string | null;
  card: string | null;
  q: string;
  page: number;
}) {
  const shell = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<unknown>('/api/shell'),
    staleTime: Infinity,
    select: recallV2Of,
  });
  const v2 = recallScreenOf(shell);

  if (v2 === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (v2) {
    const v: RecallV2View = view === 'graph' || view === 'revisions' ? view : 'cards';
    return <RecallV2Client selected={selected} view={v} card={card} q={q} page={page} />;
  }
  const v1: RecallTab = view === 'nodes' ? 'nodes' : 'map';
  return <RecallClient selected={selected} view={v1} q={q} page={page} />;
}
