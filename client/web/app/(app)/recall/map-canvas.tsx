'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Button } from '@mantle/web-ui/ui/button';
import { RecallGraph } from './recall-graph';
import { RoutingEditor } from './routing-editor';

/** The Map tab: the routing graph alone, filling the whole content area. A
 *  single click on a node opens the routing editor so its conditions can be
 *  changed right from the picture. Shares the query key with MapDetail, so
 *  switching tabs never refetches. */
export function MapCanvas({ mapId }: { mapId: string }) {
  const mapQuery = useQuery({
    queryKey: ['recall', 'maps', mapId],
    queryFn: () =>
      apiFetch<{ map: RecallMapDetailDTO }>(`/api/recall/maps/${mapId}`).then((r) => r.map),
  });
  const [editNode, setEditNode] = useState<RecallNodeDTO | null>(null);

  if (mapQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (mapQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load this map.</p>
        <Button variant="outline" size="sm" onClick={() => mapQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const map = mapQuery.data;
  if (map.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <p>This map has no compiled nodes yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <RecallGraph
        map={map}
        onEditNode={(n) => setEditNode(n)}
        className="h-full rounded-none border-none"
      />
      {editNode && (
        <RoutingEditor
          map={map}
          node={editNode}
          open
          onOpenChange={(o) => {
            if (!o) setEditNode(null);
          }}
        />
      )}
    </div>
  );
}
