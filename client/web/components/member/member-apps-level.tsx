import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
// Relative imports: member-apps.test.ts renders this file, and the node
// runner does not resolve the app's `@/` alias.
import { AppTile } from '../app-nav/app-tile';
import { AppInformationalTag } from '../app-nav/app-informational-note';
import { isInformational } from '../../lib/app-informational';
import {
  appCountLabel,
  memberAppHref,
  memberAppsHref,
  type LauncherLevel,
} from '../../lib/member-apps';

/** One card of the launcher's grid: an app, or a folder that leads to apps. */
const CARD =
  'flex h-full min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const CRUMB =
  'min-w-0 max-w-full truncate rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const SEPARATOR = 'size-3.5 shrink-0 text-muted-foreground';

/**
 * One level of the member Apps launcher, read only: the crumbs when inside a
 * folder, then its folders and its apps in one grid. Every control is a
 * link: a folder tile opens the folder, a crumb goes back up, an app card
 * opens the run view. Nothing here creates, renames, moves or shares.
 */
export function MemberAppsLevel({ level }: { level: LauncherLevel }) {
  const { folder, crumbs, folders, apps } = level;
  if (!folder && folders.length === 0 && apps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No apps yet. An admin can make an app available to the team.
      </p>
    );
  }
  return (
    <>
      {folder ? (
        <nav aria-label="Folders" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <Link href={memberAppsHref(null)} className={CRUMB}>
            Apps
          </Link>
          {crumbs.map((c) => (
            <Fragment key={c.id}>
              <ChevronRight className={SEPARATOR} aria-hidden />
              <Link href={memberAppsHref(c.id)} className={CRUMB}>
                {c.name || 'Untitled'}
              </Link>
            </Fragment>
          ))}
          <ChevronRight className={SEPARATOR} aria-hidden />
          <span aria-current="page" className="min-w-0 max-w-full truncate font-medium">
            {folder.name || 'Untitled'}
          </span>
        </nav>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {folders.map((f) => (
          <li key={f.id} className="min-w-0">
            <Link href={memberAppsHref(f.id)} className={CARD}>
              <AppTile kind="folder" icon={f.icon} color={f.color} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.name || 'Untitled'}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {appCountLabel(f.appCount)}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {apps.map((app) => (
          <li key={app.id} className="min-w-0">
            <Link href={memberAppHref(app.id)} className={CARD}>
              <AppTile icon={app.icon} color={app.color} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{app.title || 'Untitled'}</span>
                {app.description ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {app.description}
                  </span>
                ) : null}
                {isInformational(app) ? (
                  <span className="mt-1 block">
                    <AppInformationalTag />
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
