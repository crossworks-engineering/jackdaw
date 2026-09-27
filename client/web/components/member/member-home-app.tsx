'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, LayoutList } from 'lucide-react';
import { AppSandbox } from '@mantle/share-ui/app-sandbox';
import { apiFetch, bounceToLogin } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SurfaceErrorBoundary } from '@mantle/web-ui/ui/error-boundary';
import { useToast } from '@mantle/web-ui/ui/toast';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppLoader } from '@/components/app-nav/app-loader';
import { useAssistantDock } from '@/components/assistant/assistant-dock';
import {
  memberAppProblem,
  memberAppSandboxProps,
  memberHubNav,
  type MemberHomeData,
} from '@/lib/member-apps';
import { reviewListPath, splitByReview, type SpaceList } from '@/lib/member-space';
import { MemberHome } from './member-home';

/**
 * The member home (member logins Phase 4b, plan 4a "Hub app"). When the brain
 * pins a home app a member may run, it fills the home, with its `host.hub.*`
 * answered here from /api/member/home; "My work" switches to the built-in
 * home (review, recent work, team drafts, Library) and back, and shows how
 * many items came back from review, so a home app never hides them. The app
 * stays mounted while "My work" shows (switching back does not reload it).
 * No pinned app, an app that fails to load, or a brain without the route:
 * the built-in home.
 */
export function MemberHomeSwitch() {
  const router = useRouter();
  const toast = useToast();
  const { openAssistant } = useAssistantDock();
  const [failedAppId, setFailedAppId] = useState<string | null>(null);
  const [showWork, setShowWork] = useState(false);
  // The ['member-home', …] prefix is shared on purpose: sharing or submitting
  // an item invalidates it, which refreshes the sections a home app lists.
  const home = useQuery({
    queryKey: ['member-home', 'app'],
    queryFn: () => apiFetch<MemberHomeData>('/api/member/home'),
    retry: false,
  });
  // The same query MemberHome runs (same key, so one request): items that
  // came back from review must stay visible behind a home app.
  const review = useQuery({
    queryKey: ['member-home', 'review'],
    queryFn: () => apiFetch<SpaceList>(reviewListPath(['returned', 'submitted'])),
    enabled: !!home.data?.homeApp,
  });

  if (home.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const data = home.data;
  const usable = data?.homeApp && data.homeApp.appId !== failedAppId ? data : null;
  if (!usable) return <MemberHome />;

  const { homeApp, hub } = usable;
  const returned = splitByReview(review.data?.items ?? []).returned.length;
  const workLabel = returned > 0 ? `My work (${returned} returned)` : 'My work';
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showWork ? null : <SetPageTitle title="Home" />}
      <div className="flex shrink-0 justify-end gap-2 px-3 py-2">
        <Button
          variant={showWork ? 'ghost' : 'outline'}
          size="sm"
          aria-pressed={!showWork}
          onClick={() => setShowWork(false)}
        >
          <AppWindow className="size-4" aria-hidden />
          {homeApp.title || 'Home app'}
        </Button>
        <Button
          variant={showWork ? 'outline' : 'ghost'}
          size="sm"
          aria-pressed={showWork}
          onClick={() => setShowWork(true)}
        >
          <LayoutList className="size-4" aria-hidden />
          {workLabel}
        </Button>
      </div>
      {showWork ? (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <MemberHome />
        </div>
      ) : null}
      <div className={showWork ? 'hidden' : 'min-h-0 flex-1'}>
        <SurfaceErrorBoundary label="the home app" resetKeys={[homeApp.appId]}>
          <AppSandbox
            appId={homeApp.appId}
            {...memberAppSandboxProps(homeApp.appId)}
            loader={<AppLoader title={homeApp.title} icon={homeApp.icon} color={homeApp.color} />}
            frame="viewport"
            hub={{
              getData: () => hub,
              onNav: (target) => {
                const next = memberHubNav(hub, target);
                if (next?.kind === 'chat') openAssistant();
                else if (next?.kind === 'href') router.push(next.href);
              },
            }}
            onError={(m) => {
              const problem = memberAppProblem(m);
              if ('signIn' in problem) bounceToLogin();
              else toast.error(problem.text);
            }}
            onLoadFailure={() => setFailedAppId(homeApp.appId)}
          />
        </SurfaceErrorBoundary>
      </div>
    </div>
  );
}
