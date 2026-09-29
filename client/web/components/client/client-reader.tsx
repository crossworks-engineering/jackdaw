'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, X } from 'lucide-react';
import type { JSONContent } from '@tiptap/core';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { Button } from '@mantle/web-ui/ui/button';
import { ReadOnlyItemBody, type ReaderAssets } from '@/components/member/read-only-item';
import { kindLabel } from '@/lib/access-levels';
import {
  clientAssetPath,
  clientDoc,
  clientDrawUrlPath,
  clientFileUrlPath,
  clientLinkItemId,
  clientNoteMarkdown,
  sharedItemPath,
} from '@/lib/client-portal';
import type { ClientSharedItem } from '@mantle/client-types';
import { MEMBER_KIND } from '@/lib/member-kinds';

/** A client reads bytes from the client routes. */
const CLIENT_ASSETS: ReaderAssets = {
  mapAssetPath: clientAssetPath,
  drawUrlPath: clientDrawUrlPath,
  fileUrlPath: clientFileUrlPath,
};

/** The item as the client reads it: a reference the brain redacted is plain
 *  text in a page and in a note (lib/client-portal.ts). */
function forClient(item: ClientSharedItem): ClientSharedItem {
  if (item.type === 'page') return { ...item, doc: clientDoc(item.doc as JSONContent) };
  if (item.type === 'note') return { ...item, content: clientNoteMarkdown(item.content) };
  return item;
}

/**
 * One shared item, read-only (client logins C2): the member Library's
 * presenters, pointed at the client routes. A file or a drawing downloads.
 * No edit, no share, no Access control, no comments (C5). A link in a page
 * to another item the client may read opens here, in the portal.
 */
export function ClientReader({
  id,
  onClose,
  onOpen,
}: {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const asset = useAssetUrl();
  const [picked, setPicked] = useState<{ itemId: string; tabId: string } | null>(null);
  const tabId = picked?.itemId === id ? picked.tabId : null;
  const q = useQuery({
    queryKey: ['client-item', id, tabId],
    queryFn: () => apiFetch<{ item: ClientSharedItem }>(sharedItemPath(id, tabId)),
    // Switching tabs keeps the current grid on screen until the next lands.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === id ? prev : undefined),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  const item = useMemo(() => (q.data ? forClient(q.data.item) : undefined), [q.data]);

  if (q.isError && !q.data) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This item is not shared with you.' : 'Could not load this item.'}
        </p>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const download =
    item.type === 'file'
      ? { href: asset(clientFileUrlPath(item.id)), name: item.filename }
      : item.type === 'draw'
        ? { href: asset(clientDrawUrlPath(item.id)), name: `${item.title || 'drawing'}.svg` }
        : null;

  // A link to another item (or a sub-page card) opens it here; the brain
  // left only links to items the client may read.
  const onBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const card = target.closest<HTMLElement>('[data-child-page][data-page-id]');
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    const next = card
      ? card.getAttribute('data-page-id')
      : clientLinkItemId(anchor?.getAttribute('href'), window.location.origin);
    if (!next) return;
    e.preventDefault();
    onOpen(next);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
            <span aria-hidden>{item.icon ?? MEMBER_KIND[item.type].icon}</span>
            <span className="min-w-0 truncate">{item.title || 'Untitled'}</span>
          </h2>
          <div className="flex shrink-0 gap-2">
            {download ? (
              <Button variant="outline" size="sm" asChild>
                <a href={download.href} download={download.name}>
                  <Download />
                  Download
                </a>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {kindLabel(item.type)} · updated {new Date(item.updatedAt).toLocaleDateString()}
        </p>
        {item.summary && item.type !== 'note' ? (
          <p className="text-sm text-muted-foreground">{item.summary}</p>
        ) : null}
        <div onClick={onBodyClick}>
          <ReadOnlyItemBody
            item={item}
            assets={CLIENT_ASSETS}
            onPickTab={(tab) => setPicked({ itemId: id, tabId: tab })}
          />
        </div>
      </div>
    </div>
  );
}
