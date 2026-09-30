'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Map as MapIcon, Plus, Search } from 'lucide-react';
import type { RecallMapSummaryDTO } from '@mantle/web-ui/types/recall-v2';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { StatePill } from '@/components/item-list/state-pill';
import { ItemTree } from '@/components/item-tree/item-tree';
import { recallAdapter } from '@/components/item-tree/kinds/simple';
import { useTreeServes } from '@/components/item-tree/use-tree-kinds';
import { useListNav } from '@/lib/use-list-nav';
import { isPageBuilt } from '@/lib/recall-v2';
import { CompileBadge } from '../compile-badge';
import { CreateMapDialog } from './map-dialogs';
import { MapWorkbench } from './map-workbench';
import { PageBuiltMap } from './page-built-map';

export type RecallV2View = 'cards' | 'graph' | 'revisions';

type MapsPage = {
  maps: RecallMapSummaryDTO[];
  total?: number;
  page?: number;
  pageSize?: number;
};

/**
 * Recall v2: the native map editor. A map is one `recall` item and its cards
 * are rows the brain checks as they are written, so there is no compile step
 * and nothing here ever shows a stale map.
 *
 * The catalog still lists page-built (v1) maps until they are re-authored:
 * they open read-only, with their pages as the way to edit them.
 *
 * URL state: `selected` (map id), `view` (cards, graph, revisions), `card`
 * (the open card's slug), `q` and `page`.
 */
export function RecallV2Client({
  selected,
  view,
  card,
  q,
  page,
}: {
  selected: string | null;
  view: RecallV2View;
  card: string | null;
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
  return (
    <RecallV2View
      data={mapsQuery.data}
      selected={selected}
      view={view}
      card={card}
      q={q}
      page={page}
    />
  );
}

function RecallV2View({
  data,
  selected,
  view,
  card,
  q,
  page,
}: {
  data: MapsPage;
  selected: string | null;
  view: RecallV2View;
  card: string | null;
  q: string;
  page: number;
}) {
  const { pending: navPending, go } = useListNav();
  const [creating, setCreating] = useState(false);
  const maps = data.maps;
  const total = data.total ?? maps.length;
  const pageSize = data.pageSize ?? Math.max(1, maps.length);

  // The item tree when this brain serves it for Recall (folders, then maps);
  // the paged catalog for a brain before it, or if a tree call 404s. In the
  // tree, a selected map need not be on the catalog page, so the id alone
  // opens it; the catalog still says whether a map is page-built.
  const treeServes = useTreeServes('recall');
  const [treeGone, setTreeGone] = useState(false);
  const showTree = treeServes === true && !treeGone;
  const [treeQuery, setTreeQuery] = useState('');
  const pageBuilt = maps.filter((m) => isPageBuilt(m));

  const selectedId = useMemo(() => {
    if (showTree) return selected ?? maps.find((m) => !isPageBuilt(m))?.id ?? null;
    if (selected && maps.some((m) => m.id === selected)) return selected;
    return maps[0]?.id ?? null;
  }, [maps, selected, showTree]);
  const selectedMap = maps.find((m) => m.id === selectedId) ?? null;

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

  const createDialog = creating && (
    <CreateMapDialog
      open
      onOpenChange={setCreating}
      onCreated={(mapId) => go({ selected: mapId, view: null, card: null, q: null, page: null })}
    />
  );

  if (total === 0 && !q) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <MapIcon className="size-8 opacity-50" aria-hidden />
          <p className="font-medium text-foreground">No Recall maps yet</p>
          <p className="max-w-md">
            A map is a set of cards agents walk one at a time. Each card says when to open it and
            where to go next. Start one here; its entry card is written for you.
          </p>
          <div className="mt-2">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New map
            </Button>
          </div>
        </div>
        {createDialog}
      </>
    );
  }

  const list = (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Maps
          </h2>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New map
          </Button>
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
              onClick={() => go({ selected: m.id, card: null })}
            >
              <ListCardTitle className="flex items-center gap-2">
                <span className="min-w-0 truncate">{m.title}</span>
                {isPageBuilt(m) ? (
                  <CompileBadge ok={m.lastCompileOk} compiled={m.nodeCount > 0} />
                ) : (
                  !m.published && <StatePill state="draft" />
                )}
              </ListCardTitle>
              <ListCardMeta className="flex min-w-0 items-center gap-1.5">
                {[
                  isPageBuilt(m) && (
                    <span
                      key="pages"
                      className="flex items-center gap-1"
                      title="Page-built map (v1)"
                    >
                      <FileText className="size-3" aria-hidden /> pages
                    </span>
                  ),
                  m.folder && (
                    <span key="folder" className="truncate">
                      {m.folder}
                    </span>
                  ),
                  <span key="slug" className="truncate font-mono">
                    {m.slug}
                  </span>,
                  <span key="count" className="tabular-nums">
                    {m.nodeCount} {m.nodeCount === 1 ? 'card' : 'cards'}
                  </span>,
                ]
                  .filter(Boolean)
                  .flatMap((part, i) =>
                    i === 0 ? [part] : [<span key={`sep-${i}`}>·</span>, part],
                  )}
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

  let detail = null;
  if (selectedMap && isPageBuilt(selectedMap)) {
    detail = <PageBuiltMap map={selectedMap} />;
  } else if (selectedId) {
    detail = (
      <MapWorkbench
        key={selectedId}
        mapId={selectedId}
        catalog={maps}
        view={view}
        cardSlug={card}
      />
    );
  }

  const newMapButton = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus /> New map
    </Button>
  );
  const tree = (
    <aside className="flex h-full flex-col bg-muted/20">
      <div className="min-h-0 flex-1">
        <ItemTree
          kind="recall"
          adapter={recallAdapter}
          selectedItemId={selectedId}
          query={treeQuery}
          onQueryChange={setTreeQuery}
          searchPlaceholder="Search maps and folders…"
          actions={newMapButton}
          onOpenItem={(item) => go({ selected: item.id, card: null })}
          onUnsupported={() => setTreeGone(true)}
        />
      </div>
      {pageBuilt.length > 0 && (
        // Page-built (v1) maps have no tree item: they are pages. They stay
        // reachable here until they are re-authored and retired.
        <div className="max-h-48 shrink-0 space-y-1 overflow-y-auto border-t border-border p-3 scrollbar-thin">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Page-built maps
          </h3>
          {pageBuilt.map((m) => (
            <ListCard
              key={m.id}
              selected={m.id === selectedId}
              onClick={() => go({ selected: m.id, card: null })}
            >
              <ListCardTitle className="flex items-center gap-2">
                <span className="min-w-0 truncate">{m.title}</span>
                <CompileBadge ok={m.lastCompileOk} compiled={m.nodeCount > 0} />
              </ListCardTitle>
            </ListCard>
          ))}
        </div>
      )}
    </aside>
  );

  return (
    <>
      <div className="relative h-full min-h-0">
        <MasterDetail id="recall-v2" list={showTree ? tree : list} detail={detail} detailFills />
      </div>
      {createDialog}
    </>
  );
}
