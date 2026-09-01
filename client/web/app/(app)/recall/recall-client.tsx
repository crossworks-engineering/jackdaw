'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Map as MapIcon, Plus, Search, Sparkles } from 'lucide-react';
import type { RecallMapSummaryDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { Tabs, TabsList, TabsTrigger } from '@mantle/web-ui/ui/tabs';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import { useListNav } from '@/lib/use-list-nav';
import { CreateRecallDialog, type CreateMode } from './create-recall-dialog';
import { CompileBadge } from './compile-badge';
import { MapDetail } from './map-detail';
import { MapCanvas } from './map-canvas';

export type RecallTab = 'map' | 'nodes';

type MapsPage = {
  maps: RecallMapSummaryDTO[];
  /** Absent on a pre-pagination brain, which returns the whole catalog. */
  total?: number;
  page?: number;
  pageSize?: number;
};

/** Outer query-gate so the page stays data-free. `selected`, `view`, `q` and
 *  `page` ride the URL so the editor lint badge can deep-link straight to a
 *  map and searches survive a reload. */
export function RecallClient({
  selected,
  view,
  q,
  page,
}: {
  selected: string | null;
  view: RecallTab;
  q: string;
  page: number;
}) {
  const mapsQuery = useQuery({
    queryKey: ['recall', 'maps', { q, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (page > 1) params.set('page', String(page));
      const qs = params.toString();
      return apiFetch<MapsPage>(`/api/recall/maps${qs ? `?${qs}` : ''}`);
    },
    placeholderData: (prev) => prev,
  });

  if (mapsQuery.isPending && !mapsQuery.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (mapsQuery.isError && !mapsQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load the Recall maps.</p>
        <Button variant="outline" size="sm" onClick={() => mapsQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return <RecallView data={mapsQuery.data} selected={selected} view={view} q={q} page={page} />;
}

function RecallView({
  data,
  selected,
  view,
  q,
  page,
}: {
  data: MapsPage;
  selected: string | null;
  view: RecallTab;
  q: string;
  page: number;
}) {
  const { pending: navPending, go } = useListNav();
  // `null` = closed. A map and a standalone prompt both start from here; a
  // node needs a map to live in, so it is offered inside the map instead.
  const [creating, setCreating] = useState<CreateMode | null>(null);
  const maps = data.maps;
  const total = data.total ?? maps.length;
  const pageSize = data.pageSize ?? Math.max(1, maps.length);

  // Auto-select the first map of the page (style guide §8); a stale or
  // filtered-out ?selected falls back.
  const selectedId = useMemo(() => {
    if (selected && maps.some((m) => m.id === selected)) return selected;
    return maps[0]?.id ?? null;
  }, [maps, selected]);
  const selectedMap = maps.find((m) => m.id === selectedId) ?? null;

  // Debounced URL-driven search, same shape as the models explorer: never
  // rewind the box while the user is typing in it.
  const [searchInput, setSearchInput] = useState(q);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement === searchRef.current) return;
    setSearchInput(q);
  }, [q]);
  useEffect(() => {
    const h = setTimeout(() => {
      if (searchInput.trim() !== q) go({ q: searchInput.trim() || null, page: null });
    }, 350);
    return () => clearTimeout(h);
  }, [searchInput, q, go]);

  if (total === 0 && !q) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <MapIcon className="size-8 opacity-50" aria-hidden />
          <p className="font-medium text-foreground">No Recall maps yet</p>
          <p className="max-w-md">
            A map is a page tree agents walk node by node. A prompt is a single page they find by
            meaning. Start either one here and the tagging, the “Use when” line and the routing are
            written for you.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => setCreating('map')}>
              <Plus /> New map
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating('prompt')}>
              <Sparkles /> New prompt
            </Button>
          </div>
        </div>
        {creating && (
          <CreateRecallDialog
            mode={creating}
            open
            onOpenChange={(o) => {
              if (!o) setCreating(null);
            }}
          />
        )}
      </>
    );
  }

  // ONE list pane, shared by both tabs — search on top, cards, pager.
  const list = (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Maps
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus /> New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setCreating('map')}>
                <MapIcon /> Map: a tree agents walk
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreating('prompt')}>
                <Sparkles /> Prompt: found by meaning
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search maps…"
            className="h-9 pl-8"
          />
        </div>
      </div>
      <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto md:scrollbar-thin">
        {maps.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No maps match.
          </p>
        ) : (
          maps.map((m) => (
            <ListCard
              key={m.id}
              selected={m.id === selectedId}
              onClick={() => go({ selected: m.id })}
            >
              <ListCardTitle className="flex items-center gap-2">
                <span className="min-w-0 truncate">{m.title}</span>
                <CompileBadge ok={m.lastCompileOk} compiled={m.nodeCount > 0} />
              </ListCardTitle>
              <ListCardMeta>
                <span className="truncate font-mono text-[11px]">{m.slug}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {m.nodeCount} {m.nodeCount === 1 ? 'node' : 'nodes'}
                </span>
              </ListCardMeta>
            </ListCard>
          ))
        )}
      </div>
      <ListPager
        page={page}
        total={total}
        pageSize={pageSize}
        pending={navPending}
        onGo={(p) => go({ page: p > 1 ? p : null })}
      />
    </div>
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Tabs value={view} onValueChange={(v) => go({ view: v === 'nodes' ? 'nodes' : null })}>
            <TabsList>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="nodes">Nodes</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === 'map' && selectedMap && (
            <>
              <span className="min-w-0 truncate text-sm font-medium">{selectedMap.title}</span>
              <CompileBadge ok={selectedMap.lastCompileOk} compiled={selectedMap.nodeCount > 0} />
              <div className="ml-auto">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/pages/${selectedMap.id}`}>
                    <ExternalLink /> Open index page
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
        <div className="relative min-h-0 flex-1">
          {view === 'map' ? (
            /* The graph is a viewport, not reading text — it absorbs the slack
             (detailFills), and the shared list keeps its draggable width. */
            <MasterDetail
              id="recall-map"
              list={list}
              detail={selectedId ? <MapCanvas mapId={selectedId} /> : null}
              detailFills
            />
          ) : (
            <MasterDetail
              id="recall"
              list={list}
              detail={
                selectedId ? (
                  <div className="h-full">
                    <MapDetail mapId={selectedId} />
                  </div>
                ) : null
              }
              defaultDetailSize="880px"
              maxDetailSize="1200px"
            />
          )}
        </div>
      </div>
      {creating && (
        <CreateRecallDialog
          mode={creating}
          open
          onOpenChange={(o) => {
            if (!o) setCreating(null);
          }}
        />
      )}
    </>
  );
}
