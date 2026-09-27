'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { useToast } from '@mantle/web-ui/ui/toast';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppLoader } from '@/components/app-nav/app-loader';
import { memberAppSandboxProps, type MemberAppList } from '@/lib/member-apps';

/**
 * A member runs one app (member logins Phase 4b): the PUBLISHED build in the
 * sandbox, full height, over the member routes. No editor, no build, no
 * share. An app the member may not run is simply not in their list.
 */
export function MemberAppRun({ id }: { id: string }) {
  const toast = useToast();
  const list = useQuery({
    queryKey: ['member-apps'],
    queryFn: () => apiFetch<MemberAppList>('/api/member/apps'),
  });
  const app = list.data?.apps.find((a) => a.id === id) ?? null;
  const missing = list.isSuccess && !app;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SetPageTitle title={app?.title || 'App'} />
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <Link
          href="/apps"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Apps
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        {missing ? (
          <p className="p-4 text-sm text-muted-foreground">
            This app is not available. It may have been moved or taken back by an admin.
          </p>
        ) : app ? (
          <SurfaceErrorBoundary label="this app" resetKeys={[id]}>
            <AppSandbox
              appId={id}
              {...memberAppSandboxProps(id)}
              loader={<AppLoader title={app.title} icon={app.icon} color={app.color} />}
              frame="viewport"
              onError={(m) => toast.error(m)}
            />
          </SurfaceErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}
