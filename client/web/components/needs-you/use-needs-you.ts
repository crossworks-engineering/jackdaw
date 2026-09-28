'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { useRealtime } from '@/components/realtime/use-realtime';
import { QUEUE_KEY } from '@/lib/member-review';
import { NEEDS_YOU_KEY, NEEDS_YOU_REALTIME_TYPE, type NeedsYou } from '@/lib/needs-you';

/** A safety net under the live stream (it has no replay: a change during a
 *  reconnect gap is otherwise missed until the next one). */
const RECHECK_MS = 5 * 60_000;

/**
 * What waits for an admin, as the brain counts it. READ-ONLY and cheap from
 * many places: every caller shares one React Query entry. The live refresh
 * is subscribed once, by {@link useNeedsYouSync} in the watcher. Null while
 * loading, for a member, and on a brain that predates the endpoint (404),
 * so every surface simply shows nothing.
 */
export function useNeedsYou(enabled = true): NeedsYou | null {
  const q = useQuery({
    queryKey: NEEDS_YOU_KEY,
    queryFn: async (): Promise<NeedsYou | null> => {
      try {
        return await apiFetch<NeedsYou>('/api/team-admin/needs-you');
      } catch (err) {
        // An older brain has no endpoint; a member is refused. Nothing waits.
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
        throw err;
      }
    },
    enabled,
    refetchInterval: RECHECK_MS,
    refetchOnWindowFocus: true,
  });
  return q.data ?? null;
}

/**
 * The one live subscription: on `needs_you`, refetch the counts, and the
 * Review queue and Requests list if they are open (they used to poll).
 */
export function useNeedsYouSync(): void {
  const queryClient = useQueryClient();
  useRealtime([NEEDS_YOU_REALTIME_TYPE], () => {
    void queryClient.invalidateQueries({ queryKey: NEEDS_YOU_KEY });
    void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    void queryClient.invalidateQueries({ queryKey: ['team-admin', 'requests'] });
  });
}
