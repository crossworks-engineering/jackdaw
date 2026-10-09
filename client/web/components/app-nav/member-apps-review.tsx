'use client';

/**
 * Members' apps in the admin's Apps screen (workspace review pattern,
 * 2026-10-09). Above the brain's own tree: "Waiting for approval" (what
 * members submitted) and "Shared by members" (what they shared with the
 * team), each opening the review screen (/apps/review/<id>). Below it,
 * Recently deleted apps: a deleted app, a member's one included, comes back
 * for 30 days. Replaces Team admin > App review and > Member apps. On a
 * brain without the routes (404) all of it stays hidden.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { AppTint } from '@mantle/client-types';
import { AppTile } from '@/components/app-nav/app-tile';
import {
  WorkspaceReviewSections,
  type ReviewSectionRow,
} from '@/components/review/workspace-review-sections';
import {
  DELETED_APPS_KEY,
  DELETED_APPS_PATH,
  REVIEW_APPS_KEY,
  REVIEW_APPS_PATH,
  deletedAppRestorePath,
  reviewAppHref,
  sharedAppMeta,
  type DeletedApp,
  type ReviewAppLists,
} from '@/lib/space-apps';

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

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const tile = (icon: string | null, color: string | null) => (
  <AppTile icon={icon} color={color as AppTint | null} size="sm" />
);

export function MemberAppsReviewSections({ selectedId }: { selectedId?: string | null }) {
  const q = useMemberAppsForReview();
  if (!q.data) return null;
  const waiting: ReviewSectionRow[] = q.data.waiting.map((a) => ({
    id: a.id,
    title: a.title,
    href: reviewAppHref(a.id),
    lead: tile(a.icon, a.color),
    badge: <Badge variant="secondary">v{a.version}</Badge>,
    meta: `${a.author.name ?? 'a member'} · sent ${fmtWhen(a.submittedAt)}`,
  }));
  const shared: ReviewSectionRow[] = q.data.shared.map((a) => ({
    id: a.id,
    title: a.title,
    href: reviewAppHref(a.id),
    lead: tile(a.icon, a.color),
    badge: a.author.active ? undefined : <Badge variant="secondary">Inactive</Badge>,
    meta: sharedAppMeta(a, fmtWhen(a.lastActivityAt)),
  }));
  return <WorkspaceReviewSections waiting={waiting} shared={shared} selectedId={selectedId} />;
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The brain's trash of apps, at the foot of the list. Hidden on a brain
 *  without the route, and while it is empty. */
export function RecentlyDeletedApps() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: DELETED_APPS_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<{ apps: DeletedApp[] }>(DELETED_APPS_PATH)).apps;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => apiSend(deletedAppRestorePath(id), 'POST'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DELETED_APPS_KEY });
      void qc.invalidateQueries({ queryKey: ['apps'] });
      toast.success('Restored: it is in Apps, for admins only');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not restore it.'),
  });
  if (!q.data?.length) return null;
  return (
    <details className="shrink-0 border-t border-border px-2 py-1.5 text-sm">
      <summary className="cursor-pointer text-xs font-semibold">
        Recently deleted apps ({q.data.length})
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">
        A deleted app comes back for 30 days, with its data, for admins only.
      </p>
      <ul className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto scrollbar-thin">
        {q.data.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm">{d.title || 'Untitled'}</span>
              <span className="block text-xs text-muted-foreground">
                Restore until {fmtDay(d.purgeAfter)}.{d.hasData ? '' : ' No data was kept.'}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => restore.mutate(d.id)}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
