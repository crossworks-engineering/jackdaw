'use client';

/**
 * Removed in W5c: the members' apps review sections ("Waiting for approval",
 * "Shared by members") and the member app review pane are gone from /apps;
 * workspaces replace review. Recently deleted apps moved to
 * recently-deleted-apps.tsx. This hook stays ONLY for
 * app/(app)/team-admin/page.tsx (its "N waiting in Apps" strip), which a
 * later W5c part removes with Team admin. Delete this file then.
 */
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@mantle/web-ui/api-fetch';
import { REVIEW_APPS_KEY, REVIEW_APPS_PATH, type ReviewAppLists } from '@/lib/space-apps';

/** The two lists; null on a brain without the route. */
export function useMemberAppsForReview() {
  return useQuery({
    queryKey: REVIEW_APPS_KEY,
    queryFn: async (): Promise<ReviewAppLists | null> => {
      try {
        return await apiFetch<ReviewAppLists>(REVIEW_APPS_PATH);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: 60_000,
  });
}
