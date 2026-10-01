'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import { apiFetch, bounceToLogin } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { useToast } from '@mantle/web-ui/ui/toast';
import { AppLauncherLevel } from '@/components/app-nav/app-launcher-level';
import { AppLoader } from '@/components/app-nav/app-loader';
import { AppInformationalNote } from '@/components/app-nav/app-informational-note';
import {
  ItemListEmpty,
  ItemListHeader,
  ItemListScroll,
} from '@/components/item-list/item-list-header';
import { isInformational } from '@/lib/app-informational';
import {
  CLIENT_APPS_KEY,
  CLIENT_APPS_ROUTE,
  CLIENT_APPS_UNAVAILABLE,
  clientAppHref,
  clientAppProblem,
  clientAppSandboxProps,
  clientAppsEmpty,
  clientAppsHref,
  clientLauncherLevel,
  findClientApp,
  type ClientAppListWire,
} from '@/lib/client-apps';
import { CLIENT_VIEW_HREF, askUnlessMissing, isMissingRoute } from '@/lib/client-requests';
import { ClientChatLauncher } from './client-chat';

/**
 * The client's apps list (client logins C6), one query for the rail (whether
 * Apps shows at all) and the screen. A brain before C6 answers 404: asked
 * once in this page load, then never again (askUnlessMissing).
 */
export function useClientApps() {
  return useQuery({
    queryKey: CLIENT_APPS_KEY,
    queryFn: () =>
      askUnlessMissing(CLIENT_APPS_ROUTE, () => apiFetch<ClientAppListWire>(CLIENT_APPS_ROUTE)),
    retry: (count, err) => !isMissingRoute(err) && count < 1,
  });
}

/**
 * "Apps" (client logins C6), the portal's third screen beside "Shared with
 * you" and My requests: the apps an admin set to CLIENT level and published,
 * in the admin's Apps folders (read only: a folder tile opens at `&folder=`,
 * crumbs lead back), and one app running (`&id=`) in the share-ui sandbox
 * over the client routes (/api/client/apps/:id). A client runs an app and
 * nothing more: no editor, no build, no share, no folder to make or move. An
 * informational app says so, quietly: the client reads its data and writes
 * none. A brain before C6 has no such screen, and says so; a brain that
 * sends no folders shows the apps as one flat grid.
 */
export function ClientApps() {
  const params = useSearchParams();
  const id = params.get('id');
  const list = useClientApps();
  return id ? (
    <ClientAppRun id={id} list={list} />
  ) : (
    <ClientAppLauncher list={list} folderId={params.get('folder')} />
  );
}

type AppsQuery = ReturnType<typeof useClientApps>;

function ClientAppLauncher({ list, folderId }: { list: AppsQuery; folderId: string | null }) {
  const [search, setSearch] = useState('');
  const unavailable = isMissingRoute(list.error);

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col">
      <ItemListHeader
        heading={
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold">Apps</h1>
            <ClientChatLauncher />
          </div>
        }
        search={search}
        onSearch={setSearch}
        placeholder="Search apps…"
      />
      {/* The launcher's own 16px gutter, as the member's. */}
      <ItemListScroll className="space-y-4 p-4">
        {unavailable ? (
          <ItemListEmpty>{CLIENT_APPS_UNAVAILABLE}</ItemListEmpty>
        ) : !list.data ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {list.isError ? 'Could not load the apps.' : 'Loading…'}
            </p>
            {list.isError ? (
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : (
          <AppLauncherLevel
            level={clientLauncherLevel(list.data, folderId, search)}
            appHref={clientAppHref}
            folderHref={clientAppsHref}
            empty={<ItemListEmpty>{clientAppsEmpty(search)}</ItemListEmpty>}
          />
        )}
      </ItemListScroll>
    </div>
  );
}

/** One app running, full height, over the client routes. An app the client
 *  may not run (never listed, or taken back since) says so. */
function ClientAppRun({ id, list }: { id: string; list: AppsQuery }) {
  const toast = useToast();
  const app = findClientApp(list.data, id);
  const unavailable = isMissingRoute(list.error);
  const missing = unavailable || (list.isSuccess && !app);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <Link
          href={CLIENT_VIEW_HREF.apps}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Apps
        </Link>
        {app ? <h1 className="min-w-0 truncate text-sm font-semibold">{app.title}</h1> : null}
        {app && isInformational(app) ? <AppInformationalNote /> : null}
      </div>
      <div className="min-h-0 flex-1">
        {list.isPending ? (
          <div className="flex h-full items-center justify-center">
            <AppLoader />
          </div>
        ) : missing ? (
          <p className="p-4 text-sm text-muted-foreground">
            {unavailable ? CLIENT_APPS_UNAVAILABLE : 'This app is not available to you.'}
          </p>
        ) : list.isError && !app ? (
          <div className="flex items-center gap-3 p-4">
            <p className="text-sm text-destructive-ink">Could not load this app.</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : app ? (
          <SurfaceErrorBoundary label="this app" resetKeys={[app.id]}>
            <AppSandbox
              appId={app.id}
              {...clientAppSandboxProps(app.id)}
              loader={<AppLoader title={app.title} icon={app.icon} color={app.color} />}
              frame="viewport"
              onError={(m) => {
                const problem = clientAppProblem(m);
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
