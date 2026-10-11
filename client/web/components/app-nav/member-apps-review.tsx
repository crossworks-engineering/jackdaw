/**
 * Removed in W5c: the members' apps review sections and the member app
 * review pane are gone from /apps; workspaces replace review, and a W5c
 * brain answers /api/apps/members 410. Recently deleted apps moved to
 * recently-deleted-apps.tsx. This stub stays ONLY for
 * app/(app)/team-admin/page.tsx (its "N waiting in Apps" strip, now always
 * empty), which a later W5c part removes with Team admin. It asks nothing.
 * Delete this file then.
 */
import type { ReviewAppLists } from '@/lib/space-apps';

/** Nothing waits: the member app lists are gone. */
export function useMemberAppsForReview(): { data: ReviewAppLists | null | undefined } {
  return { data: null };
}
