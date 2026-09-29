'use client';

import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
// Relative, not '@/': the node test runner renders this
// (client-shared-card.test.ts) and does not resolve the app's path alias.
import { kindLabel } from '../../lib/access-levels';
import type { ClientSharedRow } from '../../lib/contract-next';
import { MEMBER_KIND } from '../../lib/member-kinds';

/**
 * One row of "Shared with you": the icon, the title, the kind and when it
 * changed. Never a summary: a brain before the audit fixes still sends one,
 * and it was written from the item's UNREDACTED text (a team page's title,
 * the text of an embedded file), so it could say what the body calls
 * "Private item". Nothing on a client surface reads it.
 */
export function ClientSharedCard({
  row,
  selected,
  onOpen,
}: {
  row: ClientSharedRow;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <ListCard selected={selected} onClick={() => onOpen(row.id)}>
      <div className="flex items-start gap-2">
        <span className="mt-px size-4 shrink-0 text-center text-sm leading-5" aria-hidden>
          {row.icon ?? MEMBER_KIND[row.type].icon}
        </span>
        <div className="min-w-0 flex-1">
          <ListCardTitle className="min-w-0">{row.title || 'Untitled'}</ListCardTitle>
          <ListCardMeta>
            {kindLabel(row.type)} · updated {new Date(row.updatedAt).toLocaleDateString()}
          </ListCardMeta>
        </div>
      </div>
    </ListCard>
  );
}
