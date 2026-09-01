'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import Link from 'next/link';
import { ExternalLink, Plus } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { RecallGraph } from './recall-graph';
import { RoutingEditor } from './routing-editor';
import { CreateRecallDialog } from './create-recall-dialog';

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
  const [adding, setAdding] = useState(false);

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
    // No COMPILED nodes means the map has never compiled clean, so adding
    // another page is the wrong advice: it cannot fix the lint and there is no
    // node to route the new one from. Send the author to the report instead.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <p className="max-w-sm">
          This map has no compiled nodes yet, so there is nothing to draw. Its index page needs to
          compile once before nodes can be added to it.
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/recall?selected=${map.id}&view=nodes`}>See the lint report</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/pages/${map.id}`}>
              <ExternalLink /> Open index page
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <RecallGraph
        map={map}
        onEditNode={(n) => setEditNode(n)}
        className="h-full rounded-none border-none"
      />
      {/* Above the canvas rather than in a flow Panel: the graph's own top-right
          holds the label toggle, and a create action should not pan away. */}
      <div className="absolute left-3 top-3 z-10">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add node
        </Button>
      </div>
      {adding && <CreateRecallDialog mode="node" map={map} open onOpenChange={setAdding} />}
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
