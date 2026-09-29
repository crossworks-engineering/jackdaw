'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { MemberAcceptedItem, MemberLibraryItem } from '@mantle/client-types';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { AudienceBadge } from '@/components/share/audience-badge';
import { memberAssetPath, memberDrawUrlPath, memberFileUrlPath } from '@/lib/member-assets';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { formatBytes } from '@/lib/upload-progress';
import { acceptedBytesChanged, acceptedChangedText, acceptedPlace } from '@/lib/member-space';
import { ReadOnlyItemBody, type ReaderAssets } from './read-only-item';
import { authorBadgeText, authorName } from '@/lib/item-author';
import { MEMBER_THREAD_CHIPS, libraryCommentsPath } from '@/lib/client-requests';
import { ClientLevelComments } from '@/components/client/client-level-comments';

type ReaderItem = MemberLibraryItem | MemberAcceptedItem;

/** A member reads bytes from the member routes. */
const MEMBER_ASSETS: ReaderAssets = {
  mapAssetPath: memberAssetPath,
  drawUrlPath: memberDrawUrlPath,
  fileUrlPath: memberFileUrlPath,
};

/**
 * One item, read-only, with the same presenters the share links use: a
 * Library item, or one the member wrote and an admin accepted (`accepted`,
 * the saved version at any level). Bytes (images, drawings, files) come from
 * the member routes, which serve the member's level and the author's own
 * accepted items. A Library item at CLIENT level carries the thread the
 * team, the admins and the clients share (client logins C5, decision 8).
 */
export function MemberReader({
  id,
  source = 'library',
  onClose,
}: {
  id: string;
  source?: 'library' | 'accepted';
  onClose: () => void;
}) {
  // A table's chosen tab, kept with the item it belongs to so opening another
  // item starts on its first tab. Null = the server's default (the first).
  const [picked, setPicked] = useState<{ itemId: string; tabId: string } | null>(null);
  const tabId = picked?.itemId === id ? picked.tabId : null;
  const q = useQuery({
    queryKey: ['member-item', id, source, tabId],
    queryFn: () =>
      apiFetch<{ item: ReaderItem }>(
        `/api/member/${source}/${id}${tabId ? `?tab=${encodeURIComponent(tabId)}` : ''}`,
      ),
    // Switching tabs keeps the current grid on screen until the next lands.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === id && prevQuery?.queryKey[2] === source ? prev : undefined,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  // react-query v5 keeps the data through a failed background refetch: only
  // an item that never loaded is an error screen.
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

  let body: React.ReactNode;
  // An accepted file or drawing an admin changed since (audit F07): the
  // brain keeps what was accepted but serves none of its bytes, so say so
  // instead of showing a broken picture or a download that 404s.
  const changed = source === 'accepted' && acceptedBytesChanged(item);
  if (changed) {
    body = (
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
    );
  } else {
    body = (
      <ReadOnlyItemBody
        item={item}
        assets={MEMBER_ASSETS}
        onPickTab={(tab) => setPicked({ itemId: id, tabId: tab })}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
            <span aria-hidden>{item.icon ?? MEMBER_KIND[item.type].icon}</span>
            <span className="min-w-0 truncate">{item.title || 'Untitled'}</span>
            <AudienceBadge level={item.audience === 'team' ? null : item.audience} />
          </h2>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <Byline item={item} />
        {'summary' in item && item.summary && item.type !== 'note' ? (
          <p className="text-sm text-muted-foreground">{item.summary}</p>
        ) : null}
        {body}
        {source === 'library' && item.audience === 'client' ? (
          <ClientLevelComments path={libraryCommentsPath(item.id)} chips={MEMBER_THREAD_CHIPS} />
        ) : null}
      </div>
    </div>
  );
}

/** Who wrote it: the member-authored badge on a Library item, or, on the
 *  author's own accepted item, when it was accepted and where it sits now. */
function Byline({ item }: { item: ReaderItem }) {
  if ('acceptedAt' in item) {
    const when = item.acceptedAt ? new Date(item.acceptedAt).toLocaleDateString() : null;
    return (
      <p className="text-xs text-muted-foreground">
        You wrote this. An admin accepted it into the brain{when ? ` on ${when}` : ''} ·{' '}
        {acceptedPlace(item.audience)}. You read the version that was accepted.
      </p>
    );
  }
  if (!item.author) return null;
  return (
    <p className="text-xs text-muted-foreground">
      <Badge variant="secondary" className="mr-1.5 align-middle">
        {authorBadgeText(item.author)}
      </Badge>
      Written by {authorName(item.author)}
    </p>
  );
}
