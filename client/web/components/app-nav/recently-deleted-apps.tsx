'use client';

/**
 * Recently deleted apps, at the foot of the Apps list: a deleted app comes
 * back for 30 days, with its data. Hidden on a brain without the route
 * (404), and while it is empty.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  DELETED_APPS_KEY,
  DELETED_APPS_PATH,
  deletedAppRestorePath,
  type DeletedApp,
} from '@/lib/space-apps';

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
