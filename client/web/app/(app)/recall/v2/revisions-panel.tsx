'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, History, User } from 'lucide-react';
import type {
  RecallMapDetailDTO,
  RecallRevisionDTO,
  RecallWriteResultDTO,
} from '@mantle/web-ui/types/recall-v2';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { formatDateTime, updatedAgo } from '@mantle/web-ui/lib/format-datetime';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { recallKeys, restoreBlockedReason, restoreCaveat } from '@/lib/recall-v2';
import type { useMapWrite } from './use-map-write';

/**
 * The map's write log, newest first: the last 50 writes, the owner's and
 * agents' alike. It exists mostly for the agents' rows, because v2 serves an
 * agent's card edit the moment it is written.
 *
 * Restore puts back what a write replaced, as a new write of its own (so it
 * is logged too, and can itself be undone). A few kinds of write cannot be
 * restored faithfully yet, and those rows say why instead of offering it.
 */
export function RevisionsPanel({
  map,
  write,
}: {
  map: RecallMapDetailDTO;
  write: ReturnType<typeof useMapWrite>;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState<RecallRevisionDTO | null>(null);
  const revQuery = useQuery({
    queryKey: recallKeys.revisions(map.id),
    queryFn: () =>
      apiFetch<{ revisions: RecallRevisionDTO[] }>(`/api/recall/maps/${map.id}/revisions`).then(
        (r) => r.revisions,
      ),
  });

  async function restore(rev: RecallRevisionDTO) {
    setConfirming(null);
    // Restore reads the map's version itself; `run` is still the path, for
    // the refresh and the error handling.
    const res = await write.run(
      () => apiSend<RecallWriteResultDTO>(`/api/recall/revisions/${rev.id}/restore`, 'POST'),
      'Could not restore that revision.',
    );
    if (res) toast.success('Restored.');
  }

  if (revQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (revQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Could not load the revisions.</p>
        <Button variant="outline" size="sm" onClick={() => revQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const revisions = revQuery.data;
  if (revisions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <History className="size-6 opacity-50" aria-hidden />
        <p>No writes logged yet.</p>
      </div>
    );
  }

  const caveat = confirming ? restoreCaveat(confirming, map.nodes) : null;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <ul className="max-w-3xl divide-y divide-border p-4">
        {revisions.map((rev) => {
          const blocked = restoreBlockedReason(rev);
          const agent = rev.actorKind === 'agent';
          return (
            <li key={rev.id} className="flex items-center gap-3 py-2.5">
              {agent ? (
                <Bot className="size-4 shrink-0 text-info-ink" aria-label="An agent" />
              ) : (
                <User className="size-4 shrink-0 text-muted-foreground" aria-label="You" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {rev.summary}
                  {rev.cardSlug && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {rev.cardSlug}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground" title={formatDateTime(rev.createdAt)}>
                  {rev.actorName ?? (agent ? 'An agent' : 'Owner')} · {updatedAgo(rev.createdAt)}
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                disabled={blocked !== null || write.pending}
                title={blocked ?? undefined}
                onClick={() => setConfirming(rev)}
              >
                Restore
              </Button>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(o) => {
          if (!o) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore “{confirming?.summary}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This puts back what that write replaced, as a new write. The current version is kept
              in the log, so this can be undone the same way.
              {caveat && <span className="mt-2 block text-warning-ink">{caveat}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && restore(confirming)}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
