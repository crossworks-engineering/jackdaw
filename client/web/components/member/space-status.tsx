'use client';

import { Lock, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { refusalMessage, statusLabels, type SpaceItemRow } from '@/lib/member-space';

/**
 * Where an own item stands (plan section 7, StatusChip): who can see it
 * (Private / Shared with team) and, once it has left draft, its review state.
 * An item an admin took over says only that (audit F07; `statusLabels`).
 */
export function StatusChip({ row }: { row: Pick<SpaceItemRow, 'sharing' | 'reviewState'> }) {
  const { sharing, review } = statusLabels(row);
  if (!sharing) {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="size-3" aria-hidden /> {review}
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="gap-1 font-normal">
        {row.sharing === 'team' ? (
          <Users className="size-3" aria-hidden />
        ) : (
          <Lock className="size-3" aria-hidden />
        )}
        {sharing}
      </Badge>
      {review ? (
        <Badge variant={row.reviewState === 'returned' ? 'destructive' : 'secondary'}>
          {review}
        </Badge>
      ) : null}
    </span>
  );
}

/** A refusal from the brain carries a sentence the member can read (quota,
 *  embed, frozen, a rate limit, …); anything else gets the caller's. */
function messageOf(err: unknown, fallback: string): string {
  return refusalMessage(err) ?? fallback;
}

export { messageOf as spaceErrorMessage };
