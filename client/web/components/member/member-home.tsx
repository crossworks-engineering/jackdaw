'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import type { MemberLibraryPage } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { SetPageTitle } from '@/components/layout/page-title';
import { useAssistantDock } from '@/components/assistant/assistant-dock';
import type { SpaceKind, SpaceList, SpaceSource } from '@/lib/member-space';
import { StatusChip } from './space-status';

const PATH: Record<SpaceKind, string> = {
  page: '/pages',
  note: '/notes',
  draw: '/draw',
  table: '/tables',
  file: '/files',
};
const ICON: Record<SpaceKind, string> = {
  page: '📄',
  note: '📝',
  draw: '✏️',
  table: '📊',
  file: '📎',
};

/** Where an item opens: its kind's screen, the right source, selected. */
export function memberItemHref(kind: SpaceKind, id: string, src: SpaceSource): string {
  const sp = new URLSearchParams({ id });
  if (src !== 'mine') sp.set('src', src);
  return `${PATH[kind]}?${sp.toString()}`;
}

type Entry = {
  id: string;
  type: SpaceKind;
  title: string;
  icon: string | null;
  updatedAt: string;
  status?: Parameters<typeof StatusChip>[0]['row'];
};

function Section({
  title,
  entries,
  src,
  empty,
}: {
  title: string;
  entries: Entry[];
  src: SpaceSource;
  empty?: string;
}) {
  if (entries.length === 0 && !empty) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => (
            <li key={e.id}>
              <Link
                href={memberItemHref(e.type, e.id, src)}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-foreground/[0.04]"
              >
                <span aria-hidden>{e.icon ?? ICON[e.type]}</span>
                <span className="min-w-0 flex-1 truncate">{e.title || 'Untitled'}</span>
                {e.status ? <StatusChip row={e.status} /> : null}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(e.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A member's home (member logins, plan section 7): what came back from review,
 * what waits for it, their recent work, what teammates shared, and what is new
 * in the Library. None of the admin dashboard's ops cards: they are admin data.
 */
export function MemberHome() {
  const { openAssistant } = useAssistantDock();
  const mine = useQuery({
    queryKey: ['member-home', 'mine'],
    queryFn: () => apiFetch<SpaceList>('/api/member/space?page=1'),
  });
  const team = useQuery({
    queryKey: ['member-home', 'team'],
    queryFn: () => apiFetch<SpaceList>('/api/member/team-drafts?page=1'),
  });
  const library = useQuery({
    queryKey: ['member-home', 'library'],
    queryFn: () => apiFetch<MemberLibraryPage>('/api/member/library?page=1'),
  });

  const own: Entry[] = (mine.data?.items ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    icon: r.icon,
    updatedAt: r.updatedAt,
    status: r,
  }));
  const returned = own.filter((e) => e.status?.reviewState === 'returned');
  const submitted = own.filter((e) => e.status?.reviewState === 'submitted');
  const recent = own
    .filter((e) => e.status?.reviewState !== 'returned' && e.status?.reviewState !== 'submitted')
    .slice(0, 8);
  const shared: Entry[] = (team.data?.items ?? []).slice(0, 8).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    icon: r.icon,
    updatedAt: r.updatedAt,
  }));
  const lib: Entry[] = (library.data?.items ?? []).slice(0, 8).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    icon: r.icon,
    updatedAt: r.updatedAt,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <SetPageTitle title="Home" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <Button variant="outline" size="sm" onClick={() => openAssistant()}>
          <MessageSquare /> Ask the assistant
        </Button>
      </header>
      <Section title="Returned to you" entries={returned} src="mine" />
      <Section title="Waiting for review" entries={submitted} src="mine" />
      <Section
        title="Your recent work"
        entries={recent}
        src="mine"
        empty="Nothing yet. Start a page, note, drawing or table from the menu."
      />
      <Section title="Shared by teammates" entries={shared} src="team" />
      <Section
        title="New in the Library"
        entries={lib}
        src="library"
        empty="Nothing has been shared with the team yet."
      />
    </div>
  );
}
