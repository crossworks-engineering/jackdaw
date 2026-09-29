'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Shapes, Upload } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { ItemCard, ItemIcon, UpdatedStamp } from '@/components/item-list/item-card';
import {
  ItemListEmpty,
  ItemListHeader,
  ItemListScroll,
} from '@/components/item-list/item-list-header';
import { ChoiceFilter, StateFilter } from '@/components/item-list/item-filters';
import { StatePill } from '@/components/item-list/state-pill';
import { MineItem } from '@/components/member/mine-item';
import { SpaceApiProvider } from '@/components/member/space-api';
import { spaceErrorMessage } from '@/components/member/space-status';
import { kindLabel } from '@/lib/access-levels';
import {
  CLIENT_KIND_OPTIONS,
  CLIENT_REQUESTS_KEY,
  CLIENT_REQUESTS_UNAVAILABLE,
  CLIENT_STATE_OPTIONS,
  acceptedStamp,
  clientItemsPath,
  clientKindOf,
  clientRequestsEmpty,
  clientRowQuery,
  clientSrcOf,
  clientStateOf,
  clientUploadRefusal,
  isMissingRoute,
  type ClientRowSrc,
} from '@/lib/client-requests';
import type { ClientItemRow, ClientItemsPage } from '@/lib/contract-next';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { clientSpace } from '@/lib/member-space';
import { useListNav } from '@/lib/use-list-nav';
import { ClientAcceptedReader } from './client-accepted-reader';
import { ClientChatLauncher } from './client-chat';

/**
 * "My requests" (client logins C5): what the client wrote and sent, in ONE
 * list built from the item list kit like "Shared with you": their own pages,
 * notes and files, each wearing its state as a pill (private, submitted,
 * returned, with admin), and what an admin accepted. Kind, state, search and
 * page live in the URL (`kind`, `state`, `q`, `page`, beside `view=requests`),
 * and so does the open item (`id`, with `src=accepted` for an accepted one).
 *
 * An own item opens in the member's item view under the client routes
 * (MineItem under `clientSpace`): edit, Save version, Submit, Recall, Delete,
 * the Returned banner with the reviewer's note, and the review talk while
 * submitted. A client never shares and has no Team drafts; it makes pages
 * and notes and uploads files (20 MB a file), nothing else.
 *
 * A brain before C5 answers the list with a 404: the screen says so,
 * quietly, and offers nothing to make.
 */
export function ClientRequests() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const { pending, go } = useListNav();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const kind = clientKindOf(params);
  const state = clientStateOf(params);
  const q = params.get('q')?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const selectedId = params.get('id');
  const selectedSrc = clientSrcOf(params);
  const [searchInput, setSearchInput] = useState(q);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Debounced search into the URL; the page resets.
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const t = setTimeout(() => go({ q: searchInput.trim() || null, page: null }), 350);
    return () => clearTimeout(t);
  }, [searchInput, q, go]);

  const list = useQuery({
    queryKey: [...CLIENT_REQUESTS_KEY, { kind, q, state, page }],
    queryFn: () => apiFetch<ClientItemsPage>(clientItemsPath({ kind, q, state, page })),
    placeholderData: (prev) => prev,
    // An older brain has no such route: say so once, ask no more.
    retry: (count, err) => !isMissingRoute(err) && count < 1,
  });
  const unavailable = isMissingRoute(list.error);

  const hrefFor = useCallback(
    (id: string | null, src?: ClientRowSrc) => {
      const s = clientRowQuery(params.toString(), { id, src });
      return s ? `${pathname}?${s}` : pathname;
    },
    [params, pathname],
  );

  // The item this screen pushed a history entry for, from no open item:
  // Close then goes Back to the list entry instead of stacking a second one.
  const pushedFromList = useRef<string | null>(null);
  const open = useCallback(
    (id: string, src: ClientRowSrc) => {
      if (id === selectedId && src === selectedSrc) return;
      pushedFromList.current = selectedId ? null : id;
      router.push(hrefFor(id, src), { scroll: false });
    },
    [router, selectedId, selectedSrc, hrefFor],
  );
  const close = () => {
    if (selectedId && pushedFromList.current === selectedId) {
      pushedFromList.current = null;
      router.back();
    } else {
      router.replace(hrefFor(null), { scroll: false });
    }
  };

  const refreshList = () => void qc.invalidateQueries({ queryKey: CLIENT_REQUESTS_KEY });

  const create = async (type: 'page' | 'note') => {
    setBusy(true);
    try {
      const { item } = await clientSpace.create({ type, title: '' });
      refreshList();
      open(item.id, 'own');
    } catch (err) {
      toast.error(spaceErrorMessage(err, `Could not create the ${MEMBER_KIND[type].one}.`));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    // Refused here, before a byte is sent: over the client's 20 MB a file.
    const tooLarge = clientUploadRefusal(file.size);
    if (tooLarge) {
      toast.error(tooLarge);
      return;
    }
    setBusy(true);
    try {
      const res = await clientSpace.upload(file);
      refreshList();
      open(res.row.id, 'own');
      toast.success('Uploaded.');
    } catch (err) {
      // The brain's own sentence for its caps (the space, the day, items).
      toast.error(spaceErrorMessage(err, 'Could not upload the file.'));
    } finally {
      setBusy(false);
    }
  };

  const data = list.data;
  const rows = data?.items ?? [];
  const rowSrc = (row: ClientItemRow): ClientRowSrc =>
    row.source === 'accepted' ? 'accepted' : 'own';
  // A wide screen opens the first item (master-detail); a phone the list.
  const first = !selectedId && isDesktop !== false ? (rows[0] ?? null) : null;
  const openItem: { id: string; src: ClientRowSrc; row: ClientItemRow | null } | null = selectedId
    ? {
        id: selectedId,
        src: selectedSrc,
        row: rows.find((r) => r.id === selectedId && rowSrc(r) === selectedSrc) ?? null,
      }
    : first
      ? { id: first.id, src: rowSrc(first), row: first }
      : null;

  const card = (row: ClientItemRow) => {
    const stamp = acceptedStamp(row);
    return (
      <li key={`${row.source}:${row.id}`}>
        <ItemCard
          id={row.id}
          kind={row.type}
          title={row.title}
          icon={<ItemIcon emoji={row.icon ?? MEMBER_KIND[row.type].icon} fallback={null} />}
          selected={openItem?.id === row.id && openItem.src === rowSrc(row)}
          onSelect={() => open(row.id, rowSrc(row))}
          footerStart={
            <>
              <UpdatedStamp at={row.updatedAt} />
              <span className="truncate text-xs text-muted-foreground">
                · {kindLabel(row.type)}
                {stamp ? ` · ${stamp}` : ''}
              </span>
            </>
          }
          pill={row.pill ? <StatePill state={row.pill} /> : null}
        />
      </li>
    );
  };

  const actions = unavailable ? null : (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={busy} title="Start a page or a note">
            {busy ? <Spinner /> : <Plus />}
            New
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void create('page')}>
            {MEMBER_KIND.page.icon} Page
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void create('note')}>
            {MEMBER_KIND.note.icon} Note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* An icon: the search box keeps its room beside New. */}
      <Button
        variant="outline"
        size="icon"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
        aria-label="Upload"
        title="Upload a file (up to 20 MB)"
      >
        <Upload />
      </Button>
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        aria-label="File to upload"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </>
  );

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <ItemListHeader
        heading={
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold">My requests</h1>
            <ClientChatLauncher />
          </div>
        }
        search={searchInput}
        onSearch={setSearchInput}
        placeholder="Search by title…"
        actions={actions}
      >
        <ChoiceFilter
          value={kind ?? 'all'}
          options={CLIENT_KIND_OPTIONS}
          onChange={(v) => go({ kind: v === 'all' ? null : v, page: null })}
          title="Filter by kind"
          icon={<Shapes className="size-3.5" />}
        />
        <StateFilter
          value={state}
          options={CLIENT_STATE_OPTIONS}
          onChange={(v) => go({ state: v === 'all' ? null : v, page: null })}
        />
      </ItemListHeader>
      <ItemListScroll pending={pending}>
        {unavailable ? (
          <ItemListEmpty>{CLIENT_REQUESTS_UNAVAILABLE}</ItemListEmpty>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the list.' : 'Loading…'}
          </p>
        ) : rows.length === 0 ? (
          <ItemListEmpty>{clientRequestsEmpty({ q, kind, state })}</ItemListEmpty>
        ) : (
          <ul className="space-y-2" aria-label="My requests">
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

  const detailPane = !openItem ? (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        {unavailable ? CLIENT_REQUESTS_UNAVAILABLE : 'Pick an item, or start one with New.'}
      </p>
    </div>
  ) : openItem.src === 'accepted' ? (
    <ClientAcceptedReader key={`accepted:${openItem.id}`} id={openItem.id} onClose={close} />
  ) : (
    <SpaceApiProvider client={clientSpace}>
      <MineItem
        key={`own:${openItem.id}`}
        id={openItem.id}
        onClose={close}
        withAdmin={openItem.row?.pill === 'with-admin'}
      />
    </SpaceApiProvider>
  );

  return isDesktop === false ? (
    <div className="relative h-full min-h-0">{selectedId ? detailPane : listPane}</div>
  ) : (
    <MasterDetail id="client-requests" list={listPane} detail={detailPane} />
  );
}
