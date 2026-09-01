'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Sparkles } from 'lucide-react';
import type { RecallPageStateDTO } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import { CompileBadge } from '../../recall/compile-badge';
import { MakePromptDialog } from '../../recall/make-prompt-dialog';

/**
 * The editor's Recall control.
 *
 * Two jobs. For a page already in a map it is the lint badge: the compiler
 * never blocks a commit, so this is the ONLY place an author learns their map
 * is serving a stale rev. For a page outside Recall it is the way IN: a quiet
 * ghost button, because the alternative was knowing that two undocumented tags
 * exist and that a prompt's body must open with a "Use when:" paragraph.
 *
 * Failure never blocks the editor, the same stance as backlinks. While the probe
 * is in flight the control renders nothing rather than flashing an offer that
 * may be about to be replaced by a badge.
 */
export function RecallBadge({ pageId }: { pageId: string }) {
  const stateQuery = useQuery({
    queryKey: ['recall', 'page', pageId],
    queryFn: () =>
      apiFetch<{ state: RecallPageStateDTO | null }>(`/api/recall/pages/${pageId}`).then(
        (r) => r.state,
      ),
  });
  const [converting, setConverting] = useState(false);

  const state = stateQuery.data;

  if (!state) {
    if (stateQuery.isPending || stateQuery.isError) return null;
    // Outside Recall: offer the way in. `standalone` means the page needs the
    // `recall` tag too, becoming a one-page map of its own.
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConverting(true)}
          title="Make this page a Recall prompt, found by meaning"
        >
          <Sparkles /> Make a prompt
        </Button>
        {converting && (
          <MakePromptDialog pageId={pageId} standalone open onOpenChange={setConverting} />
        )}
      </>
    );
  }

  const issues = state.report ?? [];
  const mine = issues.filter((i) => i.pageId === pageId);
  const shown = mine.length > 0 ? mine : issues;
  // Already in a map but only a knowledge node: it can still become matchable,
  // and then it needs `prompt` alone: membership already comes from the tree.
  const canPromote = state.node ? state.node.kind === 'knowledge' : false;

  return (
    <>
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
          {canPromote && (
            <p className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                className="text-primary-ink hover:underline"
                onClick={() => setConverting(true)}
              >
                Make this node a prompt
              </button>
              <span className="ml-1 text-xs text-muted-foreground">
                so agents also find it by meaning, not only by walking here.
              </span>
            </p>
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
      {converting && (
        <MakePromptDialog pageId={pageId} standalone={false} open onOpenChange={setConverting} />
      )}
    </>
  );
}
