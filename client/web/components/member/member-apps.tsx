'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppLauncherLevel } from '@/components/app-nav/app-launcher-level';
import { MemberMyApps } from '@/components/member/member-my-apps';
import {
  memberAppHref,
  memberAppsHref,
  memberLauncherLevel,
  type MemberAppListWire,
} from '@/lib/member-apps';

/** What the launcher says with nothing to run. */
export const MEMBER_APPS_EMPTY = 'No apps yet. An admin can make an app available to the team.';

/**
 * The member app launcher (member logins Phase 4b): the apps an admin set to
 * team level and published, in the admin's Apps folders. A folder tile opens
 * to its apps (`?folder=`, so Back goes up); the crumbs lead back. Read only:
 * there is nothing to create, rename, move or share here. A card opens the
 * run view. The pinned home app is left out: it lives on the home page,
 * which gives it its hub data. A brain that sends no folders shows the apps
 * as one flat grid.
 */
export function MemberApps() {
  const folderId = useSearchParams().get('folder');
  const list = useQuery({
    queryKey: ['member-apps'],
    queryFn: () => apiFetch<MemberAppListWire>('/api/member/apps'),
  });
  // A folder that is gone (or was never the member's to see) is the top
  // level, never an error: the same screen as no `?folder=` at all.
  const level = list.data
    ? (memberLauncherLevel(list.data, folderId) ?? memberLauncherLevel(list.data, null))
    : null;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <SetPageTitle title="Apps" />
      {list.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : list.isError || !level ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive-ink">Could not load the apps.</p>
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <AppLauncherLevel
          level={level}
          appHref={memberAppHref}
          folderHref={memberAppsHref}
          empty={<p className="text-sm text-muted-foreground">{MEMBER_APPS_EMPTY}</p>}
        />
      )}
      {/* Apps members build (team apps Phase 3): their own and the team's. */}
      <MemberMyApps />
    </div>
  );
}
