'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { MemberLibraryKind, MemberLibraryPage } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Input } from '@mantle/web-ui/ui/input';
import {
  ListCard,
  ListCardMeta,
  ListCardSnippet,
  ListCardTitle,
} from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { Button } from '@mantle/web-ui/ui/button';
import { AudienceBadge } from '@/components/share/audience-badge';
import { MemberReader } from './member-reader';

const KINDS: { value: MemberLibraryKind | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'page', label: 'Pages' },
  { value: 'note', label: 'Notes' },
  { value: 'draw', label: 'Drawings' },
  { value: 'table', label: 'Tables' },
  { value: 'file', label: 'Files' },
];

const KIND_ICON: Record<MemberLibraryKind, string> = {
  page: '📄',
  note: '📝',
  draw: '✏️',
  table: '📊',
  file: '📎',
};

/**
 * The member Library: every item the brain lets this member read (team,
 * client and public levels), newest first. The brain filters with row
 * security; this screen lists and reads. The selected item lives in the URL
 * (?id=) so a link to it works.
 */
export function MemberLibrary() {
  const router = useRouter();
  const pathname = usePathname() ?? '/m';
  const params = useSearchParams();
  const selectedId = params.get('id');
  const [kind, setKind] = useState<MemberLibraryKind | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['member-library', { kind, q, page }],
    queryFn: () => {
      const sp = new URLSearchParams({ page: String(page) });
      if (kind) sp.set('kind', kind);
      if (q.trim()) sp.set('q', q.trim());
      return apiFetch<MemberLibraryPage>(`/api/member/library?${sp.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const select = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (id) sp.set('id', id);
      else sp.delete('id');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const data = list.data;

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search the Library…"
            aria-label="Search the Library"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Kind">
          {KINDS.map((k) => (
            <Button
              key={k.label}
              size="2xs"
              variant={kind === k.value ? 'secondary' : 'ghost'}
              role="tab"
              aria-selected={kind === k.value}
              onClick={() => {
                setKind(k.value);
                setPage(1);
              }}
            >
              {k.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the Library.' : 'Loading…'}
          </p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q.trim()
              ? 'Nothing matches that search.'
              : 'Nothing has been shared with the team yet.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.items.map((row) => (
              <li key={row.id}>
                <ListCard selected={row.id === selectedId} onClick={() => select(row.id)}>
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-px size-4 shrink-0 text-center text-sm leading-5"
                      aria-hidden
                    >
                      {row.icon ?? KIND_ICON[row.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <ListCardTitle className="min-w-0">{row.title || 'Untitled'}</ListCardTitle>
                        <AudienceBadge level={row.audience === 'team' ? null : row.audience} />
                      </div>
                      {row.summary ? <ListCardSnippet>{row.summary}</ListCardSnippet> : null}
                      <ListCardMeta>
                        Updated {new Date(row.updatedAt).toLocaleDateString()}
                      </ListCardMeta>
                    </div>
                  </div>
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data ? (
        <ListPager
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          pending={list.isFetching}
          onGo={setPage}
        />
      ) : null}
    </div>
  );

  const detailPane = selectedId ? (
    <MemberReader id={selectedId} onClose={() => select(null)} />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Pick an item to read it.</p>
    </div>
  );

  return <MasterDetail id="member-library" list={listPane} detail={detailPane} />;
}
