'use client';

import { useQuery } from '@tanstack/react-query';
import type { AppNavResponse } from '@mantle/client-types/app-nav';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { AppDataPills } from './app-data-pill';
import { APP_NAV_KEY } from './use-app-nav';

/**
 * The R and R/W pill (and the admin's MCP pill) on an app row of the Apps
 * tree (brain team apps Phase 3). The tree's items carry no data access, so
 * this reads the sidebar's own answer (GET /api/app-nav, the same cached
 * query the sidebar holds), where the brain sends `dataAccess` and
 * `mcpAccess`. Nothing on a brain before them, or before app nav.
 */
export function AppTreePills({ id }: { id: string }) {
  const nav = useQuery({
    queryKey: APP_NAV_KEY,
    queryFn: () => apiFetch<AppNavResponse>('/api/app-nav'),
    staleTime: 30_000,
    retry: false,
  });
  const app = nav.data?.apps.find((a) => a.id === id);
  return app ? <AppDataPills app={app} admin /> : null;
}
