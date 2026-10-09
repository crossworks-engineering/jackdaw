'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { AppNavResponse, AppTint } from '@mantle/client-types/app-nav';
import { useRealtime } from '@/components/realtime/use-realtime';
import { treeKey } from '@/components/item-tree/tree-api';

/**
 * The brain's app-nav read (GET /api/app-nav): every app's face (icon,
 * colour), its build state and, from team apps Phase 3, its data access (the
 * R and R/W pill) and MCP access (the MCP pill). The Apps screen's folders
 * are the item tree's (GET /api/tree/apps); this read feeds the pills, and
 * the look an app shows before its own query is read again.
 */
export const APP_NAV_KEY = ['app-nav'] as const;

export function useAppNav(opts: { refetchOnMount?: 'always' } = {}) {
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: APP_NAV_KEY,
    ...(opts.refetchOnMount ? { refetchOnMount: opts.refetchOnMount } : {}),
    queryFn: () => apiFetch<AppNavResponse>('/api/app-nav'),
    // A 404 is a brain on a release before app nav: no pills, no faces.
    // Don't hammer it with retries.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
    staleTime: 30_000,
  });
  const unsupported = query.error instanceof ApiError && query.error.status === 404;

  // Another device (or an agent building an app) changed an app.
  useRealtime(['app-nav'], () => void qc.invalidateQueries({ queryKey: APP_NAV_KEY }));

  /** Change an app's icon and/or colour. Optimistic here and on the Apps
   *  screen; the PATCH notifies every other client. */
  const setAppLook = useCallback(
    async (appId: string, patch: { icon?: string; color?: AppTint | null }) => {
      const prev = qc.getQueryData<AppNavResponse>(APP_NAV_KEY);
      qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) =>
        d
          ? {
              ...d,
              apps: d.apps.map((a) =>
                a.id === appId
                  ? {
                      ...a,
                      ...(patch.icon !== undefined ? { icon: patch.icon || null } : {}),
                      ...(patch.color !== undefined ? { color: patch.color } : {}),
                    }
                  : a,
              ),
            }
          : d,
      );
      try {
        await apiSend(`/api/apps/${appId}`, 'PATCH', patch);
        // Refresh the Apps list pages (['apps', {query, page}]) and the tree's
        // rows only. Never the single-app query (['apps', id]): the editor
        // re-syncs its source tree from it, and a cosmetic write must not drop
        // unsaved edits.
        void qc.invalidateQueries({
          predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'object',
        });
        void qc.invalidateQueries({ queryKey: treeKey('apps') });
      } catch (err) {
        if (prev) qc.setQueryData(APP_NAV_KEY, prev);
        toast.error(err instanceof Error ? err.message : 'Could not save the app’s look');
      }
    },
    [qc, toast],
  );

  return { query, data: query.data, unsupported, setAppLook };
}
