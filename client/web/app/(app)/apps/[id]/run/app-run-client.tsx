'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindow, Pencil } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { BackLink } from '@mantle/web-ui/layout/back-link';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import type { AppDetail } from '@mantle/client-types';
import type { AppRowWithColor } from '@mantle/web-ui/types/app-nav';
import { SetPageTitle } from '@/components/layout/page-title';
import { ShareControl } from '@/components/share-control';
import { FocusToggle } from '@/components/layout/focus-toggle';
import { AppTile } from '@/components/app-nav/app-tile';
import { AppLookPicker } from '@/components/app-nav/app-look-picker';
import { recordAppOpen, useAppNav } from '@/components/app-nav/use-app-nav';

/**
 * The app alone in the pane, with one slim row of controls: its face (click to
 * change icon and colour), share, focus mode and the way into the editor.
 *
 * Counts an open for this login's Recent / Most used on arrival, so a link from
 * anywhere (not only the sidebar) counts. A sidebar click already counted it,
 * which is why that path marks the arrival as seen via the query cache.
 */
export function AppRunClient({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: nav, setAppLook } = useAppNav();
  const appQuery = useQuery({
    queryKey: ['apps', id],
    queryFn: () => apiFetch<{ app: AppDetail }>(`/api/apps/${id}`),
    retry: false,
  });

  useEffect(() => {
    // The sidebar records its own click; count the rest (links, reloads).
    const recent = nav?.opens[id];
    if (recent && Date.now() - Date.parse(recent.at) < 5_000) return;
    recordAppOpen(qc, id);
    // Once per app arrival, not on every nav refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (appQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (appQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Couldn&apos;t load this app.</p>
        <BackLink href="/apps">Back to apps</BackLink>
      </div>
    );
  }

  const app = appQuery.data.app as AppDetail & AppRowWithColor;
  // The nav cache is the live source for the face (optimistic on change).
  const face = nav?.apps.find((a) => a.id === id);
  const icon = face?.icon ?? app.icon;
  const color = face ? face.color : (app.color ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SetPageTitle title={app.title} />
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <AppLookPicker
          icon={icon}
          color={color}
          label={app.title}
          onChange={(l) => void setAppLook(id, l)}
          trigger={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Change icon and colour"
              title="Change icon and colour"
            >
              <AppTile icon={icon} color={color} size="md" />
            </Button>
          }
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{app.title}</span>
        {app.hasBuild && (
          <ShareControl
            nodeId={app.id}
            teamMode
            teamHint="Visitors must enter their team token, and every action is audited to that member. Team members can use the app’s Mantle tools and write to its data — a public link can only read the app’s own data. Grant it to people you trust."
          />
        )}
        <FocusToggle />
        <Button asChild size="sm" variant="outline">
          <Link href={`/apps/${app.id}`}>
            <Pencil />
            Open editor
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {app.hasBuild ? (
          <SurfaceErrorBoundary label="this app" resetKeys={[app.id]}>
            <AppSandbox appId={app.id} frame="viewport" />
          </SurfaceErrorBoundary>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <AppWindow className="size-8 opacity-50" aria-hidden />
            This app hasn’t been built yet.
            <Button asChild size="sm" variant="outline">
              <Link href={`/apps/${app.id}`}>Open editor</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
