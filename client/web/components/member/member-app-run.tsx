'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import { apiFetch, bounceToLogin } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { useToast } from '@mantle/web-ui/ui/toast';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppLoader } from '@/components/app-nav/app-loader';
import { AppInformationalNote } from '@/components/app-nav/app-informational-note';
import { isInformational } from '@/lib/app-informational';
import { memberAppProblem, memberAppSandboxProps, type MemberAppList } from '@/lib/member-apps';

/**
 * A member runs one app (member logins Phase 4b): the PUBLISHED build in the
 * sandbox, full height, over the member routes. No editor, no build, no
 * share. An app the member may not run is simply not in their list. The
 * pinned home app opens on the home page instead, where its hub data is.
 * An informational app (C6: `dataReadOnly`) says so, quietly, beside Apps:
 * the member reads its data and writes none.
 */
export function MemberAppRun({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const list = useQuery({
    queryKey: ['member-apps'],
    queryFn: () => apiFetch<MemberAppList>('/api/member/apps'),
  });
  const app = list.data?.apps.find((a) => a.id === id.toLowerCase()) ?? null;
  const isHome = !!list.data?.homeAppId && list.data.homeAppId === id.toLowerCase();
  useEffect(() => {
    if (isHome) router.replace('/');
  }, [isHome, router]);
  const missing = list.isSuccess && !app;
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
        {/* An informational app (or a public one): read, not written (C6). */}
        {app && isInformational(app) ? <AppInformationalNote /> : null}
      </div>
      <div className="min-h-0 flex-1">
        {list.isPending || isHome ? (
          <div className="flex h-full items-center justify-center">
            <AppLoader />
          </div>
        ) : list.isError ? (
          <div className="flex items-center gap-3 p-4">
            <p className="text-sm text-destructive-ink">Could not load this app.</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : missing ? (
          <p className="p-4 text-sm text-muted-foreground">
            This app is not available. It may have been moved or taken back by an admin.
          </p>
        ) : app ? (
          <SurfaceErrorBoundary label="this app" resetKeys={[id]}>
            <AppSandbox
              appId={app.id}
              {...memberAppSandboxProps(app.id)}
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
