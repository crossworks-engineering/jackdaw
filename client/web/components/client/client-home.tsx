'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Input } from '@mantle/web-ui/ui/input';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { CLIENT_SHARED_KEY, sharedListPath } from '@/lib/client-portal';
import { clientHomeHref } from '@/lib/client-surface';
import type { ClientSharedPage } from '@/lib/contract-next';
import { MEMBER_ITEM_KINDS, MEMBER_KIND, type MemberItemKind } from '@/lib/member-kinds';
import { ClientReader } from './client-reader';
import { ClientSharedCard } from './client-shared-card';

const ALL = 'all';

function asKind(v: string): MemberItemKind | null {
  return (MEMBER_ITEM_KINDS as readonly string[]).includes(v) ? (v as MemberItemKind) : null;
}

/**
 * "Shared with you" (client logins C2): every item at client level, newest
 * first, by kind and by title, a page at a time; the open item sits in the
 * URL (`/?id=`) and reads in the pane beside the list (the whole screen on a
 * phone). Read-only: a client edits, shares and comments on nothing here.
 */
export function ClientHome() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('id');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [kind, setKind] = useState<MemberItemKind | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: [...CLIENT_SHARED_KEY, { kind, q, page }],
    queryFn: () => apiFetch<ClientSharedPage>(sharedListPath({ kind, q, page })),
    placeholderData: (prev) => prev,
  });

  // The item this screen pushed a history entry for, from no open item:
  // Close then goes Back to the list entry instead of stacking a second one.
  const pushedFromList = useRef<string | null>(null);
  const open = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      pushedFromList.current = selectedId ? null : id;
      router.push(clientHomeHref(id), { scroll: false });
    },
    [router, selectedId],
  );
  const close = () => {
    if (selectedId && pushedFromList.current === selectedId) {
      pushedFromList.current = null;
      router.back();
    } else {
      router.replace(clientHomeHref(null), { scroll: false });
    }
  };

  const data = list.data;
  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <h1 className="text-base font-semibold">Shared with you</h1>
        <div className="flex items-center gap-2">
          <Select
            value={kind ?? ALL}
            onValueChange={(v) => {
              setKind(asKind(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36 shrink-0" aria-label="Kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everything</SelectItem>
              {MEMBER_ITEM_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {MEMBER_KIND[k].many.charAt(0).toUpperCase() + MEMBER_KIND[k].many.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-0 flex-1">
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
              placeholder="Search by title…"
              aria-label="Search by title"
              className="pl-8"
            />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        {!data ? (
          <p className="text-sm text-muted-foreground">
            {list.isError ? 'Could not load the list.' : 'Loading…'}
          </p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {q.trim() || kind ? 'Nothing matches that.' : 'Nothing has been shared with you yet.'}
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Shared items">
            {data.items.map((row) => (
              <li key={row.id}>
                <ClientSharedCard row={row} selected={row.id === selectedId} onOpen={open} />
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
    <ClientReader id={selectedId} onClose={close} onOpen={open} />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Pick an item to read it.</p>
    </div>
  );

  return isDesktop === false ? (
    <div className="relative h-full min-h-0">{selectedId ? detailPane : listPane}</div>
  ) : (
    <MasterDetail id="client-shared" list={listPane} detail={detailPane} />
  );
}
