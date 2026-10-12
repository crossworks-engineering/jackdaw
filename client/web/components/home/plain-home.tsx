'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HubData } from '@mantle/share-ui/app-bridge-protocol';
import { Badge } from '@mantle/web-ui/ui/badge';
import { ListCard, ListCardSnippet, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { SetPageTitle } from '@/components/layout/page-title';
import { memberAppHref } from '@/lib/member-apps';
import {
  isPrivateWorkspace,
  sortWorkspaces,
  workspaceHref,
  workspaceLabel,
  type ShellWorkspace,
} from '@/lib/workspaces';

/** The workspace screens every login opens, in the nav's order. `kind` is
 *  the count the landing page shows on the card (none for Apps: its own
 *  section lists them). */
export const HOME_LINKS: readonly { href: string; label: string; kind: string | null }[] = [
  { href: '/pages', label: 'Pages', kind: 'page' },
  { href: '/notes', label: 'Notes', kind: 'note' },
  { href: '/files', label: 'Files', kind: 'file' },
  { href: '/tables', label: 'Tables', kind: 'table' },
  { href: '/draw', label: 'Draw', kind: 'draw' },
  { href: '/apps', label: 'Apps', kind: null },
];

/** How many pages the Built-in home lists. */
export const HOME_SECTION_LIMIT = 8;

/**
 * The Built-in home (task d78e7bde): the default landing page of every
 * workspace, Admin included. With `hub` (GET /api/home?ws=) it shows that
 * workspace's data: how many items of each kind it reads, its newest pages
 * and the apps it holds that the login may run. Under "All my workspaces"
 * the same over every workspace of the login. Without `hub` (still loading,
 * or a brain before the landing pages) it shows the screens and the login's
 * workspaces only.
 */
export function PlainHomeView({
  workspaces,
  actions,
  scope,
  hub,
}: {
  workspaces: readonly ShellWorkspace[];
  /** Text buttons right of the heading (ask the assistant). */
  actions?: ReactNode;
  /** The current workspace's name, or "All my workspaces". */
  scope?: string;
  hub?: Pick<HubData, 'sections' | 'counts' | 'apps'> | null;
}) {
  const sorted = sortWorkspaces(workspaces.map((w) => ({ ...w, archived: false })));
  const sections = hub?.sections.slice(0, HOME_SECTION_LIMIT) ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <SetPageTitle title="Home" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Home</h1>
          {scope ? <p className="truncate text-sm text-muted-foreground">{scope}</p> : null}
        </div>
        {actions}
      </header>
      <HomeSection title="Your work">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {HOME_LINKS.map((l) => {
            const n = hub && l.kind ? hub.counts[l.kind] : undefined;
            return (
              <li key={l.href}>
                <ListCard asChild>
                  <Link href={l.href}>
                    <div className="flex items-baseline justify-between gap-2">
                      <ListCardTitle>{l.label}</ListCardTitle>
                      {typeof n === 'number' ? (
                        <span className="text-sm tabular-nums text-muted-foreground">{n}</span>
                      ) : null}
                    </div>
                  </Link>
                </ListCard>
              </li>
            );
          })}
        </ul>
      </HomeSection>
      {hub ? (
        <HomeSection title="Newest pages">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pages here yet.</p>
          ) : (
            <ul className="space-y-2">
              {sections.map((s) => (
                <li key={s.token}>
                  <ListCard asChild>
                    <Link href={`/pages/${encodeURIComponent(s.token)}`}>
                      <ListCardTitle>{s.title || 'Untitled'}</ListCardTitle>
                      {s.summary ? <ListCardSnippet>{s.summary}</ListCardSnippet> : null}
                    </Link>
                  </ListCard>
                </li>
              ))}
            </ul>
          )}
        </HomeSection>
      ) : null}
      {hub && hub.apps.length > 0 ? (
        <HomeSection title="Apps">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {hub.apps.map((a) => (
              <li key={a.token}>
                <ListCard asChild>
                  <Link href={memberAppHref(a.token)}>
                    <ListCardTitle>{a.title}</ListCardTitle>
                    {a.description ? <ListCardSnippet>{a.description}</ListCardSnippet> : null}
                  </Link>
                </ListCard>
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}
      <HomeSection title="Your workspaces">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">You are not in a workspace yet.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((w) => (
              <li key={w.id}>
                <ListCard asChild>
                  <Link href={workspaceHref(w.id)}>
                    <div className="flex items-center gap-2">
                      <ListCardTitle className="flex-1">{workspaceLabel(w)}</ListCardTitle>
                      {w.moderator && !isPrivateWorkspace(w) ? (
                        <Badge variant="outline">Moderator</Badge>
                      ) : null}
                    </div>
                  </Link>
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </HomeSection>
    </div>
  );
}

function HomeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
