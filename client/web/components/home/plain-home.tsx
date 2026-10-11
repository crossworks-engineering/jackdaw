'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { ListCard, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { SetPageTitle } from '@/components/layout/page-title';
import { useShellWorkspaces } from '@/components/workspaces/use-shell-workspaces';
import { useShellRole } from '@/components/layout/shell-role';
import {
  hasArea,
  isPrivateWorkspace,
  sortWorkspaces,
  workspaceHref,
  workspaceLabel,
  type ShellWorkspace,
} from '@/lib/workspaces';

/** The workspace screens every login opens, in the nav's order. */
export const HOME_LINKS: readonly { href: string; label: string }[] = [
  { href: '/pages', label: 'Pages' },
  { href: '/notes', label: 'Notes' },
  { href: '/files', label: 'Files' },
  { href: '/tables', label: 'Tables' },
  { href: '/draw', label: 'Draw' },
  { href: '/apps', label: 'Apps' },
];

/**
 * The plain home (phase W5c): the login's workspaces, from the shell, and the
 * screens it works in. A client's home, a member's (W6b: with Ask the
 * assistant), and an admin's without the settings area. Plain on purpose: the dashboard's cards are the brain's operations,
 * the settings area's.
 */
export function PlainHomeView({
  workspaces,
  actions,
}: {
  workspaces: readonly ShellWorkspace[];
  /** Text buttons right of the heading (a member's: ask the assistant). */
  actions?: ReactNode;
}) {
  const sorted = sortWorkspaces(workspaces.map((w) => ({ ...w, archived: false })));
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <SetPageTitle title="Home" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Home</h1>
        {actions}
      </header>
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
      <HomeSection title="Your work">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {HOME_LINKS.map((l) => (
            <li key={l.href}>
              <ListCard asChild>
                <Link href={l.href}>
                  <ListCardTitle>{l.label}</ListCardTitle>
                </Link>
              </ListCard>
            </li>
          ))}
        </ul>
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

/**
 * `/`, by the brain's role (until phase W6a): a member's own home (`member`),
 * and for an admin the dashboard with the settings area (a brain that names
 * no areas: every admin). A client, or an admin without that area, gets the
 * plain home. The shell has answered before any page renders, so this never
 * waits.
 */
export function HomeSwitch({ dashboard, member }: { dashboard: ReactNode; member: ReactNode }) {
  const shell = useShellWorkspaces();
  const role = useShellRole();
  if (role === 'member') return <>{member}</>;
  if (role === 'admin' && hasArea(shell?.areas, 'settings')) return <>{dashboard}</>;
  return <PlainHomeView workspaces={shell?.workspaces ?? []} />;
}
