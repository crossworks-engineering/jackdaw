'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import type { MemberItemPill } from '@mantle/client-types';
import type { MemberItemRow } from '@mantle/client-types';
import { apiEventStream, apiFetch } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { useToast } from '@mantle/web-ui/ui/toast';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { SetPageTitle } from '@/components/layout/page-title';
import { ItemCard, ItemIcon, UpdatedStamp } from '@/components/item-list/item-card';
import {
  ItemListEmpty,
  ItemListHeader,
  ItemListScroll,
  NewButton,
} from '@/components/item-list/item-list-header';
import { DetailsToggle, StateFilter } from '@/components/item-list/item-filters';
import { StatePill, type ItemState } from '@/components/item-list/state-pill';
import { useCardDetails } from '@/components/item-list/use-card-details';
import {
  LIBRARY_CLIENT_TITLE,
  libraryLevelBadge,
  memberSpace,
  memberUploadRefusal,
  workspaceNavMode,
  workspaceQuery,
  type SpaceItemRow,
  type SpaceKind,
  type WorkspaceSource,
} from '@/lib/member-space';
import { MEMBER_STATE_OPTIONS, fetchMemberItems, memberStateOf, srcOf } from '@/lib/member-items';
import { authorName } from '@/lib/item-author';
import { authorRoleLabel } from '@/lib/member-review';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { useListNav } from '@/lib/use-list-nav';
import { MemberReader } from './member-reader';
import { MineItem } from './mine-item';
import { ClientRequestItem } from './client-request-item';
import { TeamDraftItem } from './team-draft-item';
import { spaceErrorMessage } from './space-status';

const KIND = MEMBER_KIND;

// The pill a row wears is the kit's StatePill: the brain's words and the
// kit's must stay one set.
const pillsMatch: [MemberItemPill] extends [ItemState] ? true : false = true;
void pillsMatch;

function asSource(v: string | null): WorkspaceSource {
  return v === 'team' || v === 'library' || v === 'accepted' || v === 'client-request' ? v : 'mine';
}

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
 * A member's screen for one kind (member logins, the real app shell), built
 * like the admin screens (item-list alignment, P4): ONE list of everything
 * the member may see, newest first (their own items, teammates' shared
 * drafts, the Library, what they wrote that an admin accepted), each row
 * wearing its state as a pill. No source switch: the State filter narrows
 * the list when asked. Search, state and page live in the URL (`q`,
 * `state`, `page`); the open item is `?id=` with `?src=` naming which view
 * opens it (own, a teammate's draft, the Library, accepted, or a client's
 * submitted item, read only: client logins C5).
 */
export function MemberWorkspace({ kind }: { kind: SpaceKind }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { pending, go } = useListNav();
  const meta = KIND[kind];
  const q = params.get('q')?.trim() ?? '';
  const state = memberStateOf(params);
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  // `?selected=` is what the admin screens' /notes/<id> and /tables/<id>
  // redirects write; a member's screen reads it the same way.
  const openId = params.get('id') ?? params.get('selected');
  const openSource = asSource(params.get('src'));
  const [searchInput, setSearchInput] = useState(q);
  const [details, changeDetails] = useCardDetails(`mantle_member_${kind}_card_details_v1`);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  useSpaceEvents();

  // Debounced search into the URL; the page resets.
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const t = setTimeout(() => go({ q: searchInput.trim() || null, page: null }), 350);
    return () => clearTimeout(t);
  }, [searchInput, q, go]);

  // The item this screen pushed a history entry for, from no open item:
  // Close then goes Back to that list entry instead of stacking a second one.
  const pushedFromList = useRef<string | null>(null);
  const setParams = useCallback(
    (next: { src?: WorkspaceSource; id?: string | null }) => {
      const current = params.toString();
      const qs = workspaceQuery(current, next);
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (workspaceNavMode(current, next) === 'push') {
        pushedFromList.current = openId ? null : (next.id ?? null);
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [params, pathname, router, openId],
  );

  const list = useQuery({
    // `member-space-list` so every own-item change (save, share, submit,
    // the event stream) refreshes it, as it refreshed the old source lists.
    queryKey: ['member-space-list', 'items', kind, { q, state, page }],
    queryFn: () => fetchMemberItems({ kind, q, state, page }),
    placeholderData: (prev) => prev,
  });

  const create = async () => {
    if (kind === 'file') return;
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
    // Refused here, before a byte is sent: this upload skips the upload dock
    // and its size check, and the brain would only refuse it after the lot.
    const tooLarge = memberUploadRefusal(file.size);
    if (tooLarge) {
      toast.error(tooLarge);
      return;
    }
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
  const rows = data?.items ?? [];
  // What the detail shows: the item the URL opens, else (on a wide screen)
  // the first card, the master-detail default. A phone opens the list first.
  const first = !openId && isDesktop !== false ? (rows[0] ?? null) : null;
  const open: { id: string; source: WorkspaceSource; row: MemberItemRow | null } | null = openId
    ? {
        id: openId,
        source: openSource,
        row: rows.find((r) => r.id === openId && srcOf(r.source) === openSource) ?? null,
      }
    : first
      ? { id: first.id, source: srcOf(first.source), row: first }
      : null;

  const empty = q
    ? 'Nothing matches that search.'
    : state === 'all'
      ? meta.create
        ? `Nothing here yet. Start a new ${meta.one} with New.`
        : `Nothing here yet. Upload a ${meta.one} to start.`
      : state === 'private'
        ? `You have no private ${meta.many}.`
        : state === 'client-requests'
          ? `No client ${meta.many} wait for review.`
          : `No ${meta.many} match this filter.`;

  const card = (row: MemberItemRow) => {
    const level = libraryLevelBadge(row.audience);
    // A client's submitted item (client logins C5): who wrote it, as a badge
    // (a level badge is outlined; this one is filled).
    const fromClient = row.source === 'client-request';
    return (
      <ItemCard
        key={`${row.source}:${row.id}`}
        id={row.id}
        kind={row.type}
        title={row.title}
        icon={<ItemIcon emoji={row.icon ?? meta.icon} fallback={null} />}
        badge={
          fromClient ? (
            <Badge variant="secondary" className="mt-0.5 shrink-0" title="Written by a client">
              {authorRoleLabel('client')}
            </Badge>
          ) : level ? (
            <Badge variant="outline" className="mt-0.5 shrink-0" title={LIBRARY_CLIENT_TITLE}>
              {level}
            </Badge>
          ) : null
        }
        selected={open?.id === row.id && open.source === srcOf(row.source)}
        onSelect={() => setParams({ src: srcOf(row.source), id: row.id })}
        footerStart={
          <>
            <UpdatedStamp at={row.updatedAt} />
            {row.byMe ? (
              <span className="truncate text-xs text-muted-foreground">· by you</span>
            ) : row.author ? (
              <span className="truncate text-xs text-muted-foreground">
                · by {authorName(row.author)}
              </span>
            ) : null}
          </>
        }
        pill={row.pill ? <StatePill state={row.pill} /> : null}
      >
        {details && row.summary ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{row.summary}</p>
        ) : null}
      </ItemCard>
    );
  };

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <ItemListHeader
        search={searchInput}
        onSearch={setSearchInput}
        placeholder={`Search ${meta.title.toLowerCase()}…`}
        actions={
          <>
            {meta.create ? (
              <NewButton onClick={() => void create()} busy={busy} title={`New ${meta.one}`} />
            ) : null}
            {meta.upload ? (
              <>
                <Button
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  title="Upload a file"
                >
                  <Upload /> Upload
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
          </>
        }
      >
        <StateFilter
          value={state}
          options={MEMBER_STATE_OPTIONS}
          onChange={(v) => go({ state: v === 'all' ? null : v, page: null })}
          tourTarget="member-state"
        />
        <DetailsToggle details={details} onChange={changeDetails} />
      </ItemListHeader>
      <ItemListScroll pending={pending || (list.isFetching && !!data)}>
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the list.' : 'Loading…'}
          </p>
        ) : rows.length === 0 ? (
          <ItemListEmpty>{empty}</ItemListEmpty>
        ) : (
          rows.map(card)
        )}
      </ItemListScroll>
      {data ? (
        <ListPager
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          pending={pending}
          onGo={(p) => go({ page: p > 1 ? p : null })}
          noun={{ one: meta.one, many: meta.many }}
        />
      ) : null}
    </div>
  );

  const close = () => {
    if (openId && pushedFromList.current === openId) {
      pushedFromList.current = null;
      router.back();
    } else {
      setParams({ id: null });
    }
  };
  // An own item an admin took over (audit F07): the list row says so, and
  // the item view opens nothing of it.
  const withAdmin = open?.row?.pill === 'with-admin';
  const detailPane = open ? (
    open.source === 'mine' ? (
      <MineItem key={open.id} id={open.id} onClose={close} withAdmin={withAdmin} />
    ) : open.source === 'team' ? (
      <TeamDraftItem key={open.id} id={open.id} onClose={close} />
    ) : open.source === 'client-request' ? (
      <ClientRequestItem
        key={open.id}
        id={open.id}
        author={open.row?.author ?? null}
        onClose={close}
      />
    ) : (
      <MemberReader
        key={`${open.source}:${open.id}`}
        id={open.id}
        source={open.source === 'accepted' ? 'accepted' : 'library'}
        onClose={close}
      />
    )
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        {meta.create
          ? `Pick a ${meta.one}, or start a new one with New.`
          : `Pick a ${meta.one} to open it.`}
      </p>
    </div>
  );

  return (
    <>
      <SetPageTitle title={meta.title} />
      {isDesktop === false ? (
        <div className="relative h-full min-h-0">{openId ? detailPane : listPane}</div>
      ) : (
        <MasterDetail id={`member-${kind}`} list={listPane} detail={detailPane} />
      )}
    </>
  );
}
