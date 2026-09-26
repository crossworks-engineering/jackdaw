'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { memberSpace } from '@/lib/member-space';
import { SpaceComments } from './space-comments';
import { SpaceItemView } from './space-item-view';

/**
 * A teammate's item shared with the team: its SAVED version (never the
 * author's draft), read-only, with the discussion under it. When the author
 * makes it private again it is simply gone (404).
 */
export function TeamDraftItem({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['member-space-item', 'team', id],
    queryFn: () => memberSpace.get('team', id),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This item is no longer shared with the team.' : 'Could not load this item.'}
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
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{item.row.title || 'Untitled'}</h2>
            <p className="text-xs text-muted-foreground">
              A teammate’s work, shared with the team. You are reading their saved version.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        <SpaceItemView source="team" item={item} />
        <SpaceComments source="team" id={item.row.id} />
      </div>
    </div>
  );
}
