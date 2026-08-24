'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon } from 'lucide-react';
import type { RecallPageStateDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import { CompileBadge } from '../../recall/compile-badge';

/**
 * The editor lint badge — the piece that closes the Recall authoring loop.
 * The compiler never blocks a commit, so this badge is the ONLY place an
 * author learns the open page belongs to a map that is serving a stale rev.
 * Renders nothing for pages outside Recall (the probe is one cheap indexed
 * read); failure never blocks the editor, same stance as backlinks.
 */
export function RecallBadge({ pageId }: { pageId: string }) {
  const stateQuery = useQuery({
    queryKey: ['recall', 'page', pageId],
    queryFn: () =>
      apiFetch<{ state: RecallPageStateDTO | null }>(`/api/recall/pages/${pageId}`).then(
        (r) => r.state,
      ),
  });

  const state = stateQuery.data;
  if (!state) return null;

  const issues = state.report ?? [];
  const mine = issues.filter((i) => i.pageId === pageId);
  const shown = mine.length > 0 ? mine : issues;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center" aria-label="Recall map state">
          <CompileBadge ok={state.map.lastCompileOk} compiled={state.map.nodeCount > 0} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <MapIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate">
            {state.map.title}
            {state.node && <span className="ml-1.5 font-mono text-xs">({state.node.slug})</span>}
          </span>
        </p>
        {state.map.lastCompileOk ? (
          <p className="mt-1.5 text-muted-foreground">
            This page is part of a Recall map and its last compile was clean.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-warning-ink">
              The map&apos;s last compile failed its lint — agents keep reading the last good
              version until this is fixed.
            </p>
            {shown.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {shown.slice(0, 6).map((issue, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span
                      className={
                        issue.severity === 'error'
                          ? 'shrink-0 font-medium text-destructive-ink'
                          : 'shrink-0 font-medium text-warning-ink'
                      }
                    >
                      {issue.severity}
                    </span>
                    <span className="min-w-0">{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="mt-2">
          <Link
            href={`/recall?selected=${state.map.id}`}
            className="text-primary-ink hover:underline"
          >
            Open in Recall
          </Link>
        </p>
      </PopoverContent>
    </Popover>
  );
}
