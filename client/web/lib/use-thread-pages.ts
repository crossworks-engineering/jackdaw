'use client';

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { CommentThreadPage } from './contract-next';
import { olderCursor, threadComments, threadPagePath } from './thread-pages';

/**
 * A comment thread read a page at a time (thread-pages.ts): the newest page
 * first, and Load older for each page before it. A refresh (a poll, a
 * realtime event, an invalidation after a post) asks every page read so
 * far again, each from the page before it, so no comment falls between two
 * pages when new ones push the newest page along.
 *
 * `fetchPage` reads one page by its path (default: apiFetch); the client
 * threads pass one that remembers a missing route (client-requests.ts).
 */
export function useThreadPages<C extends { id: string; createdAt: string }>(opts: {
  queryKey: QueryKey;
  path: string;
  fetchPage?: (path: string) => Promise<CommentThreadPage<C>>;
  enabled?: boolean;
  refetchInterval?: number | false | ((error: unknown) => number | false);
  refetchOnWindowFocus?: boolean;
  retry?: (failureCount: number, error: unknown) => boolean;
}) {
  const fetchPage = opts.fetchPage ?? ((p: string) => apiFetch<CommentThreadPage<C>>(p));
  const interval = opts.refetchInterval;
  const q = useInfiniteQuery({
    queryKey: opts.queryKey,
    queryFn: ({ pageParam }) => fetchPage(threadPagePath(opts.path, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => olderCursor(last) ?? null,
    enabled: opts.enabled,
    refetchInterval:
      typeof interval === 'function' ? (query) => interval(query.state.error) : interval,
    refetchOnWindowFocus: opts.refetchOnWindowFocus,
    retry: opts.retry,
  });
  return {
    query: q,
    /** Every comment read so far, oldest first. */
    comments: threadComments(q.data?.pages ?? []),
    /** The brain holds older comments than those read. */
    hasMore: q.hasNextPage,
    loadOlder: () => void q.fetchNextPage(),
    loadingOlder: q.isFetchingNextPage,
  };
}
