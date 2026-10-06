'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';

/** What the brain says about itself at `GET /api/version`. */
export type ServerVersionPayload = {
  version?: string;
  contractVersion?: number;
  gitSha?: string | null;
  buildTime?: string | null;
};

/**
 * The Mantle (brain) version, for every surface that shows it beside the
 * Jackdaw build: the dashboard's Build card and the rail's version footer.
 * One query key, so both read the same cached answer and the page asks once.
 *
 * `label` has three states, and the failure one is explicit on purpose: a
 * brain that is unreachable (down, blocked, wrong origin) must not leave a
 * loading ellipsis that reads like a slow network forever.
 *
 * `paused` counts as unreachable, not as loading. On a network-level failure
 * (DNS, refused, CORS) the fetch rejects without a Response, and TanStack's
 * default `networkMode: 'online'` parks the retry instead of failing it: the
 * query then sits at `pending/paused` indefinitely and never reaches
 * `isError`. Without this branch the label showed "…" forever.
 */
export function useServerVersion() {
  const query = useQuery({
    queryKey: ['server-version'],
    queryFn: () => apiFetch<ServerVersionPayload>('/api/version'),
    // Constant for the life of the server build; a roll reloads the tab anyway.
    staleTime: 5 * 60 * 1000,
  });
  const data = query.data;
  const unreachable = query.isError || query.fetchStatus === 'paused';
  const label = data?.version ? `v${data.version}` : unreachable ? 'unavailable' : '…';
  return { data, unreachable, label };
}
