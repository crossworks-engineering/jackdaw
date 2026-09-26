'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload } from 'lucide-react';
import type { MemberLibraryPage } from '@mantle/client-types';
import { apiEventStream, apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import {
  ListCard,
  ListCardMeta,
  ListCardSnippet,
  ListCardTitle,
} from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { SetPageTitle } from '@/components/layout/page-title';
import {
  listPath,
  memberSpace,
  type SpaceItemRow,
  type SpaceKind,
  type SpaceList,
  type SpaceSource,
} from '@/lib/member-space';
import { MemberReader } from './member-reader';
import { MineItem } from './mine-item';
import { TeamDraftItem } from './team-draft-item';
import { StatusChip, spaceErrorMessage } from './space-status';

const KIND: Record<
  SpaceKind,
  { title: string; one: string; icon: string; create: boolean; upload?: boolean }
> = {
  page: { title: 'Pages', one: 'page', icon: '📄', create: true },
  note: { title: 'Notes', one: 'note', icon: '📝', create: true },
  draw: { title: 'Draw', one: 'drawing', icon: '✏️', create: false },
  table: { title: 'Tables', one: 'table', icon: '📊', create: false },
  file: { title: 'Files', one: 'file', icon: '📎', create: false, upload: true },
};

const SOURCES: { value: SpaceSource; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'team', label: 'Team drafts' },
  { value: 'library', label: 'Library' },
];

function asSource(v: string | null): SpaceSource {
  return v === 'team' || v === 'library' ? v : 'mine';
}

type Row = {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: string;
  summary?: string | null;
  space?: SpaceItemRow;
};

/**
 * Personal items change under a member from other tabs and teammates: one
 * event stream (own space + team-shared, ids only) refreshes what shows.
 */
function useSpaceEvents() {
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;
  useEffect(() => {
    const stop = apiEventStream(
      '/api/member/realtime',
      () => {
        void qcRef.current.invalidateQueries({ queryKey: ['member-space-list'] });
        void qcRef.current.invalidateQueries({ queryKey: ['member-space-item'] });
        void qcRef.current.invalidateQueries({ queryKey: ['member-space-comments'] });
      },
      { maxAttempts: 8 },
    );
    return stop;
  }, []);
}

/**
 * A member's screen for one kind (member logins, the real app shell): the
 * same URL an admin uses (/pages, /notes, …), three sources side by side:
 * Mine (their own items, editable), Team drafts (teammates' shared items,
 * saved versions) and the Library (brain items at the team level, read-only).
 * The source and the selected item live in the URL (?src=, ?id=).
 */
export function MemberWorkspace({ kind }: { kind: SpaceKind }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const source = asSource(params.get('src'));
  // `?selected=` is what the admin screens' /notes/<id> and /tables/<id>
  // redirects write; a member's screen reads it the same way.
  const selectedId = params.get('id') ?? params.get('selected');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const meta = KIND[kind];
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  useSpaceEvents();

  const setParams = useCallback(
    (next: { src?: SpaceSource; id?: string | null }) => {
      const sp = new URLSearchParams(params.toString());
      if (next.src !== undefined) {
        if (next.src === 'mine') sp.delete('src');
        else sp.set('src', next.src);
      }
      if (next.id !== undefined) {
        if (next.id) sp.set('id', next.id);
        else sp.delete('id');
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const list = useQuery({
    queryKey: ['member-space-list', source, kind, { q, page }],
    queryFn: async (): Promise<{ rows: Row[]; total: number; page: number; pageSize: number }> => {
      const path = listPath(source, { kind, q, page });
      if (source === 'library') {
        const d = await apiFetch<MemberLibraryPage>(path);
        return {
          rows: d.items.map((r) => ({
            id: r.id,
            title: r.title,
            icon: r.icon,
            updatedAt: r.updatedAt,
            summary: r.summary,
          })),
          total: d.total,
          page: d.page,
          pageSize: d.pageSize,
        };
      }
      const d = await apiFetch<SpaceList>(path);
      return {
        rows: d.items.map((r) => ({
          id: r.id,
          title: r.title,
          icon: r.icon,
          updatedAt: r.updatedAt,
          space: r,
        })),
        total: d.total,
        page: d.page,
        pageSize: d.pageSize,
      };
    },
    placeholderData: (prev) => prev,
  });

  const create = async () => {
    if (kind !== 'page' && kind !== 'note') return;
    setBusy(true);
    try {
      const { item } = await memberSpace.create({ type: kind, title: '' });
      void qc.invalidateQueries({ queryKey: ['member-space-list'] });
      setParams({ src: 'mine', id: item.id });
    } catch (err) {
      toast.error(spaceErrorMessage(err, `Could not create the ${meta.one}.`));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await apiFetch<{ row: SpaceItemRow }>('/api/member/space-files', {
        method: 'POST',
        body: fd,
      });
      void qc.invalidateQueries({ queryKey: ['member-space-list'] });
      setParams({ src: 'mine', id: res.row.id });
      toast.success('Uploaded to your files.');
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not upload the file.'));
    } finally {
      setBusy(false);
    }
  };

  const data = list.data;
  const empty =
    source === 'mine'
      ? `You have no ${meta.title.toLowerCase()} yet.`
      : source === 'team'
        ? 'No teammate has shared any with the team yet.'
        : 'Nothing of this kind has been shared with the team yet.';

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={source}
            onValueChange={(v) => {
              if (!v) return;
              setPage(1);
              setParams({ src: v as SpaceSource, id: null });
            }}
            aria-label="Whose items"
            className="grid flex-1 grid-cols-3"
          >
            {SOURCES.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {source === 'mine' && meta.create ? (
            <Button
              size="icon-sm"
              aria-label={`New ${meta.one}`}
              title={`New ${meta.one}`}
              disabled={busy}
              onClick={() => void create()}
            >
              <Plus />
            </Button>
          ) : null}
          {source === 'mine' && meta.upload ? (
            <>
              <Button
                size="icon-sm"
                aria-label="Upload a file"
                title="Upload a file"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
              </Button>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
            </>
          ) : null}
        </div>
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
            placeholder={`Search ${meta.title.toLowerCase()}…`}
            aria-label={`Search ${meta.title.toLowerCase()}`}
            className="pl-8"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the list.' : 'Loading…'}
          </p>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q.trim() ? 'Nothing matches that search.' : empty}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((row) => (
              <li key={row.id}>
                <ListCard
                  selected={row.id === selectedId}
                  onClick={() => setParams({ id: row.id })}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-px size-4 shrink-0 text-center text-sm leading-5"
                      aria-hidden
                    >
                      {row.icon ?? meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <ListCardTitle className="min-w-0">{row.title || 'Untitled'}</ListCardTitle>
                      {row.summary ? <ListCardSnippet>{row.summary}</ListCardSnippet> : null}
                      <ListCardMeta>
                        {source === 'mine' && row.space ? (
                          <span className="mr-2 inline-block align-middle">
                            <StatusChip row={row.space} />
                          </span>
                        ) : null}
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

  const close = () => setParams({ id: null });
  const detailPane = selectedId ? (
    source === 'mine' ? (
      <MineItem id={selectedId} onClose={close} />
    ) : source === 'team' ? (
      <TeamDraftItem id={selectedId} onClose={close} />
    ) : (
      <MemberReader id={selectedId} onClose={close} />
    )
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        {source === 'mine' && meta.create
          ? `Pick a ${meta.one}, or start a new one with +.`
          : `Pick a ${meta.one} to open it.`}
      </p>
    </div>
  );

  return (
    <>
      <SetPageTitle title={meta.title} />
      {isDesktop === false ? (
        <div className="relative h-full min-h-0">{selectedId ? detailPane : listPane}</div>
      ) : (
        <MasterDetail id={`member-${kind}`} list={listPane} detail={detailPane} />
      )}
    </>
  );
}
