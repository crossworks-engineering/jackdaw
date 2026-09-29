'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { ApiError, apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import { ReadOnlyItemBody, type ReaderAssets } from '@/components/member/read-only-item';
import { clientAssetPath, clientDrawUrlPath, clientFileUrlPath } from '@/lib/client-portal';
import { CLIENT_ACCEPTED_KEY, clientAcceptedPath } from '@/lib/client-requests';
import type { ClientAcceptedItem } from '@mantle/client-types';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { acceptedBytesChanged, acceptedChangedText } from '@/lib/member-space';
import { formatBytes } from '@/lib/upload-progress';

/** A client reads bytes from the client routes. */
const CLIENT_ASSETS: ReaderAssets = {
  mapAssetPath: clientAssetPath,
  drawUrlPath: clientDrawUrlPath,
  fileUrlPath: clientFileUrlPath,
  fileEmbedPath: clientFileUrlPath,
};

/**
 * An item the client wrote and an admin accepted (client logins C5): the
 * version accepted, read only, from /api/client/accepted/:id (a file's bytes
 * from /api/client/files/:id). Nothing to do with it any more: it is the
 * brain's now. A file an admin changed since says so instead of a download
 * that would fail.
 */
export function ClientAcceptedReader({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: [...CLIENT_ACCEPTED_KEY, id],
    queryFn: () => apiFetch<{ item: ClientAcceptedItem }>(clientAcceptedPath(id)),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  if (q.isError && !q.data) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This item is not available to you.' : 'Could not load this item.'}
        </p>
      </div>
    );
  }
  const item = q.data?.item;
  if (!item) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  const when = item.acceptedAt ? formatDate(item.acceptedAt) : null;
  const changed = acceptedBytesChanged(item);
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
            <span aria-hidden>{item.icon ?? MEMBER_KIND[item.type].icon}</span>
            <span className="min-w-0 truncate">{item.title || 'Untitled'}</span>
          </h2>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          You wrote this, and it was accepted{when ? ` on ${when}` : ''}. You read the version that
          was accepted.
        </p>
        {changed ? (
          <div
            role="status"
            className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            <p>{acceptedChangedText(item.type)}</p>
            {item.type === 'file' ? (
              <p className="text-xs text-muted-foreground">
                {item.filename}
                {item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ''}
              </p>
            ) : null}
          </div>
        ) : (
          <ReadOnlyItemBody item={item} assets={CLIENT_ASSETS} onPickTab={() => undefined} />
        )}
      </div>
    </div>
  );
}
