'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SetPageTitle } from '@/components/layout/page-title';
import { AppTile } from '@/components/app-nav/app-tile';
import { memberAppHref, type MemberAppList } from '@/lib/member-apps';

/**
 * The member app launcher (member logins Phase 4b): the apps an admin set to
 * team level and published. A card opens the run view; there is nothing to
 * create, edit or share here.
 */
export function MemberApps() {
  const list = useQuery({
    queryKey: ['member-apps'],
    queryFn: () => apiFetch<MemberAppList>('/api/member/apps'),
  });
  const apps = list.data?.apps ?? [];
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <SetPageTitle title="Apps" />
      {list.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : list.isError ? (
        <p className="text-sm text-destructive-ink">Could not load the apps. Try again later.</p>
      ) : apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No apps yet. An admin can make an app available to the team.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <li key={app.id}>
              <Link
                href={memberAppHref(app.id)}
                className="flex h-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AppTile icon={app.icon} color={app.color} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{app.title || 'Untitled'}</span>
                  {app.description ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {app.description}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
