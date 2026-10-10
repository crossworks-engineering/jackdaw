'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { useWorkspaces } from '@/components/workspaces/workspace-queries';
import {
  workspaceHref,
  workspaceKey,
  workspacesOfLogin,
  type WorkspaceDetail,
} from '@/lib/workspaces';

/**
 * "Workspaces: Admin, Team" for one login, as links to each workspace's
 * screen (plan 7.1). Read from the workspaces routes the Workspaces screen
 * uses, so this screen needs nothing new from the brain. Nothing at all on a
 * brain without workspaces.
 */
export function LoginWorkspaces({ loginId }: { loginId: string }) {
  const list = useWorkspaces();
  const ids = (list.data ?? []).filter((w) => !w.archived).map((w) => w.id);
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: workspaceKey(id),
      queryFn: () => apiFetch<WorkspaceDetail>(`/api/workspaces/${encodeURIComponent(id)}`),
    })),
  });
  if (!list.data) return null;
  const loading = details.some((d) => d.isPending);
  const mine = workspacesOfLogin(
    details.map((d) => d.data),
    loginId,
  );
  return <LoginWorkspacesView workspaces={mine} loading={loading} />;
}

export function LoginWorkspacesView({
  workspaces,
  loading,
}: {
  workspaces: { id: string; name: string }[];
  loading: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Workspaces</div>
      <div className="mt-0.5">
        {loading ? (
          '…'
        ) : workspaces.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          workspaces.map((w, i) => (
            <span key={w.id}>
              {i > 0 ? ', ' : null}
              <Link
                href={workspaceHref(w.id)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {w.name}
              </Link>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
