'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { ApiError, apiFetch } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import type { MemberItemAuthor } from '@mantle/client-types';
import { clientRequestBytesPath, clientRequestPath } from '@/lib/client-requests';
import { authorName } from '@/lib/item-author';
import { authorRoleLabel } from '@/lib/member-review';
import { MEMBER_KIND } from '@/lib/member-kinds';
import type { SpaceItem } from '@/lib/member-space';
import { SpaceItemView } from './space-item-view';

/**
 * A client's SUBMITTED item, as a member reads it (client logins C5,
 * decision 5 B): its saved version, read only, from the member's own route
 * (/api/member/client-requests/:id; a file's bytes from its bytes route).
 * The Client badge says who wrote it. No actions and no thread: the review
 * talk is the client's and the reviewers', and an admin accepts or returns
 * it from the Review queue.
 */
export function ClientRequestItem({
  id,
  author,
  onClose,
}: {
  id: string;
  /** The list row's author (the client), when the list gave one. */
  author: MemberItemAuthor | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ['member-client-request', id],
    queryFn: () => apiFetch<SpaceItem>(clientRequestPath(id)),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  // react-query v5 keeps the data through a failed background refetch: only
  // an item that never loaded is an error screen.
  if (q.isError && !q.data) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This request is not waiting for review any more.' : 'Could not load this item.'}
        </p>
      </div>
    );
  }
  const item = q.data;
  if (!item) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  const { row } = item;
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
            <span aria-hidden>{row.icon ?? MEMBER_KIND[row.type].icon}</span>
            <span className="min-w-0 truncate">{row.title || 'Untitled'}</span>
          </h2>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          <Badge variant="secondary" className="mr-1.5 align-middle">
            {authorRoleLabel('client')}
          </Badge>
          {author ? `Written by ${authorName({ ...author, role: 'client' })}. ` : ''}A client sent
          this for review. You are reading the version they submitted.
        </p>
        <SpaceItemView
          source="team"
          item={item}
          fileBytesPath={row.type === 'file' ? clientRequestBytesPath(row.id) : undefined}
        />
      </div>
    </div>
  );
}
