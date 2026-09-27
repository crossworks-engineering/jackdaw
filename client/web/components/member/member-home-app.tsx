'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, LayoutList } from 'lucide-react';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppLoader } from '@/components/app-nav/app-loader';
import { useAssistantDock } from '@/components/assistant/assistant-dock';
import { memberAppSandboxProps, memberHubNav, type MemberHomeData } from '@/lib/member-apps';
import { MemberHome } from './member-home';

/**
 * The member home (member logins Phase 4b, plan 4a "Hub app"). When the brain
 * pins a home app a member may run, it fills the home, with its `host.hub.*`
 * answered here from /api/member/home; "My work" switches to the built-in
 * home (review, recent work, team drafts, Library) and back. No pinned app,
 * an app that fails to load, or a brain without the route: the built-in home.
 */
export function MemberHomeSwitch() {
  const router = useRouter();
  const { openAssistant } = useAssistantDock();
  const [failedAppId, setFailedAppId] = useState<string | null>(null);
  const [showWork, setShowWork] = useState(false);
  const home = useQuery({
    queryKey: ['member-home', 'app'],
    queryFn: () => apiFetch<MemberHomeData>('/api/member/home'),
    retry: false,
  });

  if (home.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const app = home.data?.homeApp ?? null;
  const usable = app && app.appId !== failedAppId ? app : null;
  if (!usable || showWork) {
    return (
      <>
        {usable ? (
          <div className="mx-auto flex max-w-3xl justify-end px-4 pt-4 md:px-8">
            <Button variant="outline" size="sm" onClick={() => setShowWork(false)}>
              <AppWindow className="size-4" aria-hidden />
              {usable.title || 'Home app'}
            </Button>
          </div>
        ) : null}
        <MemberHome />
      </>
    );
  }

  const hub = home.data!.hub;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SetPageTitle title="Home" />
      <div className="flex shrink-0 justify-end px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => setShowWork(true)}>
          <LayoutList className="size-4" aria-hidden />
          My work
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <SurfaceErrorBoundary label="the home app" resetKeys={[usable.appId]}>
          <AppSandbox
            appId={usable.appId}
            {...memberAppSandboxProps(usable.appId)}
            loader={<AppLoader title={usable.title} />}
            frame="viewport"
            hub={{
              getData: () => hub,
              onNav: (target) => {
                const next = memberHubNav(hub, target);
                if (next?.kind === 'chat') openAssistant();
                else if (next?.kind === 'href') router.push(next.href);
              },
            }}
            onLoadFailure={() => setFailedAppId(usable.appId)}
          />
        </SurfaceErrorBoundary>
      </div>
    </div>
  );
}
