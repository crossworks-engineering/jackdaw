'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Route } from 'lucide-react';
import type { RecallMapDetailDTO, RecallNodeDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Button } from '@mantle/web-ui/ui/button';
import { CompileBadge } from './compile-badge';
import { RecallGraph } from './recall-graph';
import { RoutingEditor } from './routing-editor';

/** Right pane: one compiled map — compile state, the lint report, the routing
 *  graph, and the node list with the routing editor. */
export function MapDetail({ mapId }: { mapId: string }) {
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
  const errors = (map.report ?? []).filter((i) => i.severity === 'error');
  const warnings = (map.report ?? []).filter((i) => i.severity === 'warning');

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 scrollbar-thin">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
          <span className="min-w-0 truncate">{map.title}</span>
          <CompileBadge ok={map.lastCompileOk} compiled={map.nodeCount > 0} />
        </h2>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/pages/${map.id}`}>
              <ExternalLink /> Open index page
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="font-mono text-xs">{map.slug}</span>
        <span>·</span>
        <span className="tabular-nums">
          {map.nodeCount} {map.nodeCount === 1 ? 'node' : 'nodes'}
        </span>
        {map.enterWhen && (
          <>
            <span>·</span>
            <span className="min-w-0">Enter when: {map.enterWhen}</span>
          </>
        )}
      </div>

      {map.report && map.report.length > 0 && (
        <section className="rounded-md border border-border bg-muted/30 p-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Last compile report
            {!map.lastCompileOk && (
              <span className="ml-2 normal-case tracking-normal text-warning-ink">
                the map keeps serving its last good version until these are fixed
              </span>
            )}
          </h3>
          <ul className="space-y-1.5 text-sm">
            {[...errors, ...warnings].map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={
                    issue.severity === 'error'
                      ? 'mt-0.5 shrink-0 rounded-sm bg-destructive/15 px-1.5 text-[11px] font-medium text-destructive-ink'
                      : 'mt-0.5 shrink-0 rounded-sm bg-warning/15 px-1.5 text-[11px] font-medium text-warning-ink'
                  }
                >
                  {issue.severity}
                </span>
                <span className="min-w-0">
                  {issue.message}{' '}
                  {issue.pageId && (
                    <Link
                      href={`/pages/${issue.pageId}`}
                      className="text-primary-ink hover:underline"
                    >
                      open page
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {map.nodes.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Routing
          </h3>
          <RecallGraph map={map} onEditNode={(n) => setEditNode(n)} />
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Nodes
        </h3>
        <div className="space-y-2">
          {map.nodes.map((n) => (
            <NodeCard key={n.id} node={n} onEdit={() => setEditNode(n)} />
          ))}
        </div>
      </section>

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

function NodeCard({ node, onEdit }: { node: RecallNodeDTO; onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate font-medium">{node.title}</span>
        <KindChip kind={node.kind} />
        <span className="ml-auto flex shrink-0 gap-1.5">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Route /> Routing
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/pages/${node.id}`}>
              <ExternalLink /> Page
            </Link>
          </Button>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span className="font-mono">{node.slug}</span>
        <span>·</span>
        <span className="tabular-nums">{node.bodyChars.toLocaleString()} chars</span>
        <span>·</span>
        <span className="tabular-nums">
          {node.options.length} {node.options.length === 1 ? 'option' : 'options'}
        </span>
        {node.kind === 'prompt' && node.useWhen && (
          <>
            <span>·</span>
            <span className="min-w-0 truncate">Use when: {node.useWhen}</span>
          </>
        )}
      </div>
    </div>
  );
}

function KindChip({ kind }: { kind: RecallNodeDTO['kind'] }) {
  if (kind === 'index') {
    return (
      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-ink">
        index
      </span>
    );
  }
  if (kind === 'prompt') {
    return (
      <span className="shrink-0 rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info-ink">
        prompt
      </span>
    );
  }
  return null;
}
