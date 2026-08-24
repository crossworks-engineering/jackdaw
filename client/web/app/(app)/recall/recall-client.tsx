'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon } from 'lucide-react';
import type { RecallMapSummaryDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Button } from '@mantle/web-ui/ui/button';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { useListNav } from '@/lib/use-list-nav';
import { CompileBadge } from './compile-badge';
import { MapDetail } from './map-detail';

/** Outer query-gate so the page stays data-free. `selected` rides the URL so
 *  the editor lint badge can deep-link straight to a map. */
export function RecallClient({ selected }: { selected: string | null }) {
  const mapsQuery = useQuery({
    queryKey: ['recall', 'maps'],
    queryFn: () =>
      apiFetch<{ maps: RecallMapSummaryDTO[] }>('/api/recall/maps').then((r) => r.maps),
  });

  if (mapsQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (mapsQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load the Recall maps.</p>
        <Button variant="outline" size="sm" onClick={() => mapsQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return <RecallView maps={mapsQuery.data} selected={selected} />;
}

function RecallView({ maps, selected }: { maps: RecallMapSummaryDTO[]; selected: string | null }) {
  const { go } = useListNav();

  // Auto-select the first map (style guide §8); a stale ?selected falls back.
  const selectedId = useMemo(() => {
    if (selected && maps.some((m) => m.id === selected)) return selected;
    return maps[0]?.id ?? null;
  }, [maps, selected]);

  if (maps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <MapIcon className="size-8 opacity-50" aria-hidden />
        <p className="font-medium text-foreground">No Recall maps yet</p>
        <p className="max-w-md">
          A map is a page tree whose root carries the <code>recall</code> tag. Author the pages in
          Pages, tag the root, and the compiled map appears here.
        </p>
      </div>
    );
  }

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 p-3 pb-1">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Maps
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{maps.length}</span>
      </div>
      <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto md:scrollbar-thin">
        {maps.map((m) => (
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
        ))}
      </div>
    </div>
  );

  return (
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
  );
}
