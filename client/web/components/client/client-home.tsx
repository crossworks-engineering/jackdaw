'use client';

import { useCallback, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Shapes } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import type { ClientSharedPage, ClientSharedRow } from '@mantle/client-types';
import {
  ItemListEmpty,
  ItemListHeader,
  ItemListScroll,
} from '@/components/item-list/item-list-header';
import { ChoiceFilter } from '@/components/item-list/item-filters';
import { CLIENT_SHARED_KEY, sharedListPath } from '@/lib/client-portal';
import { MEMBER_ITEM_KINDS, MEMBER_KIND, type MemberItemKind } from '@/lib/member-kinds';
import { useListNav } from '@/lib/use-list-nav';
import { useUrlSearchBox } from '@/lib/url-search-box';
import { ClientChatLauncher } from './client-chat';
import { ClientReader } from './client-reader';
import { ClientSharedCard } from './client-shared-card';
import { ItemTree } from '@/components/item-tree/item-tree';
import { readerTreeAdapter } from '@/components/item-tree/kinds/reader';
import { ReaderViewToggle, readerViewOf } from '@/components/item-tree/reader-view-toggle';
import { treeKindOfItem, useReaderTreeKinds } from '@/components/item-tree/use-tree-kinds';

const ALL = 'all';

const KIND_OPTIONS: readonly { value: MemberItemKind | typeof ALL; label: string }[] = [
  { value: ALL, label: 'Everything' },
  ...MEMBER_ITEM_KINDS.map((k) => ({
    value: k,
    label: MEMBER_KIND[k].many.charAt(0).toUpperCase() + MEMBER_KIND[k].many.slice(1),
  })),
];

function asKind(v: string | null): MemberItemKind | null {
  return v && (MEMBER_ITEM_KINDS as readonly string[]).includes(v) ? (v as MemberItemKind) : null;
}

/**
 * "Shared with you" (client logins C2): every item at client level, newest
 * first, by kind and by title, a page at a time, built like every other list
 * screen (item-list alignment, P5): the kit's header, card and pager. Search,
 * kind and page live in the URL (`q`, `kind`, `page`), and so does the open
 * item (`?id=`), which reads in the pane beside the list (the whole screen
 * on a phone); a wide screen opens the first item. Read-only: a client edits,
 * shares and comments on nothing here, so the cards carry no actions and no
 * state pill.
 */
export function ClientHome() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const { pending, go } = useListNav();
  const selectedId = params.get('id');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const kind = asKind(params.get('kind'));
  const q = params.get('q')?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  // The search box and the URL's `q`, each following the other (Back after
  // a search restores the list); the page resets on a new search.
  const [searchInput, setSearchInput] = useUrlSearchBox(q, (next) => go({ q: next, page: null }));

  // The brain's folders as a read-only tree (folder sharing), one kind at a
  // time, for the kinds the brain serves to clients. The list stays the
  // default; `view=folders` in the URL picks the tree.
  const served = useReaderTreeKinds('client');
  const folderKinds = MEMBER_ITEM_KINDS.filter((k) => {
    const t = treeKindOfItem(k);
    return t !== null && readerTreeAdapter(t) !== null && (served ?? []).includes(t);
  });
  const wantsFolders = readerViewOf(params) === 'folders';
  const folders = folderKinds.length > 0 && wantsFolders;
  const folderKind = folders ? (kind && folderKinds.includes(kind) ? kind : folderKinds[0]!) : null;
  const treeKind = folderKind ? treeKindOfItem(folderKind) : null;
  const treeAdapter = treeKind ? readerTreeAdapter(treeKind) : null;
  const [treeQuery, setTreeQuery] = useState('');
  const setView = (v: 'list' | 'folders') =>
    go({ view: v === 'folders' ? 'folders' : null, page: null });

  const list = useQuery({
    queryKey: [...CLIENT_SHARED_KEY, { kind, q, page }],
    queryFn: () => apiFetch<ClientSharedPage>(sharedListPath({ kind, q, page })),
    placeholderData: (prev) => prev,
    // Not while the folders are chosen, nor while it is not yet known whether
    // the brain serves them (the first paint).
    enabled: !folders && !(wantsFolders && served === undefined),
  });

  /** This screen's URL with the open item changed, the list's own params
   *  kept. */
  const hrefFor = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (id) sp.set('id', id);
      else sp.delete('id');
      const s = sp.toString();
      return s ? `${pathname}?${s}` : pathname;
    },
    [params, pathname],
  );

  // The item this screen pushed a history entry for, from no open item:
  // Close then goes Back to the list entry instead of stacking a second one.
  const pushedFromList = useRef<string | null>(null);
  const open = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      pushedFromList.current = selectedId ? null : id;
      router.push(hrefFor(id), { scroll: false });
    },
    [router, selectedId, hrefFor],
  );
  const close = () => {
    if (selectedId && pushedFromList.current === selectedId) {
      pushedFromList.current = null;
      router.back();
    } else {
      router.replace(hrefFor(null), { scroll: false });
    }
  };

  const data = list.data;
  const rows = data?.items ?? [];
  // A wide screen opens the first item (master-detail); a phone the list.
  const openId = selectedId ?? (!folders && isDesktop !== false ? (rows[0]?.id ?? null) : null);

  const card = (row: ClientSharedRow) => (
    <li key={row.id}>
      <ClientSharedCard row={row} selected={row.id === openId} onOpen={open} />
    </li>
  );

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <ItemListHeader
        heading={
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold">Shared with you</h1>
            <ClientChatLauncher />
          </div>
        }
        search={searchInput}
        onSearch={setSearchInput}
        placeholder="Search by title…"
      >
        <ChoiceFilter
          value={kind ?? ALL}
          options={KIND_OPTIONS}
          onChange={(v) => go({ kind: v === ALL ? null : v, page: null })}
          title="Filter by kind"
          icon={<Shapes className="size-3.5" />}
        />
        {folderKinds.length > 0 ? <ReaderViewToggle value="list" onChange={setView} /> : null}
      </ItemListHeader>
      <ItemListScroll pending={pending}>
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the list.' : 'Loading…'}
          </p>
        ) : rows.length === 0 ? (
          <ItemListEmpty>
            {q || kind ? 'Nothing matches that.' : 'Nothing has been shared with you yet.'}
          </ItemListEmpty>
        ) : (
          <ul className="space-y-2" aria-label="Shared items">
            {rows.map(card)}
          </ul>
        )}
      </ItemListScroll>
      {data ? (
        <ListPager
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          pending={pending}
          onGo={(p) => go({ page: p > 1 ? p : null })}
          noun={{ one: 'item', many: 'items' }}
        />
      ) : null}
    </div>
  );

  const treePane =
    folders && folderKind && treeKind && treeAdapter ? (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold">Shared with you</h1>
            <ClientChatLauncher />
          </div>
          <div className="flex items-center gap-2">
            <ChoiceFilter
              value={folderKind}
              options={KIND_OPTIONS.filter((o) =>
                (folderKinds as readonly string[]).includes(o.value),
              )}
              onChange={(v) => go({ kind: v })}
              title="Which kind"
              icon={<Shapes className="size-3.5" />}
            />
            <ReaderViewToggle value="folders" onChange={setView} />
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <ItemTree
            key={treeKind}
            kind={treeKind}
            source="client"
            mode="read"
            // Below md the tree is the whole screen (list OR detail).
            capOnNarrow={false}
            adapter={treeAdapter}
            query={treeQuery}
            onQueryChange={setTreeQuery}
            selectedItemId={selectedId}
            onOpenItem={(item) => open(item.id)}
            onUnsupported={() => setView('list')}
          />
        </div>
      </div>
    ) : null;

  const detailPane = openId ? (
    <ClientReader key={openId} id={openId} onClose={close} onOpen={open} />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Pick an item to read it.</p>
    </div>
  );

  return isDesktop === false ? (
    <div className="relative h-full min-h-0">
      {selectedId ? detailPane : (treePane ?? listPane)}
    </div>
  ) : (
    <MasterDetail id="client-shared" list={treePane ?? listPane} detail={detailPane} />
  );
}
