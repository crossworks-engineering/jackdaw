'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import { apiFetch, ApiError, bounceToLogin } from '@mantle/web-ui/api-fetch';
import type { AppRow } from '@mantle/client-types';
import { Button } from '@mantle/web-ui/ui/button';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { useToast } from '@mantle/web-ui/ui/toast';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppLoader } from '@/components/app-nav/app-loader';
import { AppInformationalNote } from '@/components/app-nav/app-informational-note';
import { isInformational } from '@/lib/app-informational';
import { memberAppProblem } from '@/lib/member-apps';
import { ownerAppSandboxProps } from '@/lib/owner-app-sandbox';

/**
 * A member runs one app (member logins Phase 4b): the PUBLISHED build in the
 * sandbox, full height, on the app routes every login uses (W7e: GET
 * /api/apps/:id and the runner, POST /api/apps/:id/frame-ticket and its
 * brokers, in the login's own scope). No editor and no build: a member
 * changes its apps over its own MCP connection, and shares them with Grant
 * Access on the Apps screen. An app the member may not read answers 404.
 * The pinned home app (`isHub`) opens on the home page instead, where its
 * hub data is. An informational app (C6: `dataReadOnly`) says so, quietly,
 * beside Apps: the member reads its data and writes none.
 */
/** What the run screen says for an app the member may not run: not
 *  published yet, moved to the trash, or not shared with its workspaces. */
export const MEMBER_APP_MISSING =
  'You cannot run this app. It has no published build, it is in the trash, or it is not shared with your workspaces.';

export function MemberAppRun({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const list = useQuery({
    queryKey: ['apps', id, 'run'],
    queryFn: () => apiFetch<{ app: AppRow }>(`/api/apps/${encodeURIComponent(id)}`),
    retry: false,
  });
  const notFound = list.error instanceof ApiError && list.error.status === 404;
  // Only a published build runs.
  const app = list.data?.app.hasBuild ? list.data.app : null;
  const isHome = list.data?.app.isHub === true;
  useEffect(() => {
    if (isHome) router.replace('/');
  }, [isHome, router]);
  const missing = notFound || (list.isSuccess && !app);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SetPageTitle title={app?.title || 'App'} />
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <Link
          href="/apps"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Apps
        </Link>
        {/* An informational app: read, not written (C6). */}
        {app && isInformational(app) ? <AppInformationalNote /> : null}
      </div>
      <div className="min-h-0 flex-1">
        {list.isPending || isHome ? (
          <div className="flex h-full items-center justify-center">
            <AppLoader />
          </div>
        ) : missing ? (
          <p className="p-4 text-sm text-muted-foreground">{MEMBER_APP_MISSING}</p>
        ) : list.isError ? (
          <div className="flex items-center gap-3 p-4">
            <p className="text-sm text-destructive-ink">Could not load this app.</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : app ? (
          <SurfaceErrorBoundary label="this app" resetKeys={[id]}>
            <AppSandbox
              appId={app.id}
              {...ownerAppSandboxProps(app.id)}
              loader={<AppLoader title={app.title} icon={app.icon} color={app.color} />}
              frame="viewport"
              onError={(m) => {
                const problem = memberAppProblem(m);
                if ('signIn' in problem) bounceToLogin();
                else toast.error(problem.text);
              }}
            />
          </SurfaceErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}
