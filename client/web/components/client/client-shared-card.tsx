'use client';

// Relative, not '@/': the node test runner renders this
// (client-shared-card.test.ts) and does not resolve the app's path alias.
import { ItemCard, ItemIcon, UpdatedStamp } from '../item-list/item-card';
import { kindLabel } from '../../lib/access-levels';
import type { ClientSharedRow } from '@mantle/client-types';
import { MEMBER_KIND } from '../../lib/member-kinds';

/**
 * One row of "Shared with you": the kit's item card (item-list alignment),
 * read-only, so no state pill and no actions: the icon, the title, when it
 * changed and its kind. Never a summary: a brain before the audit fixes
 * still sends one, and it was written from the item's UNREDACTED text (a
 * team page's title, the text of an embedded file), so it could say what
 * the body calls "Private item". Nothing on a client surface reads it.
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
    <ItemCard
      id={row.id}
      kind={row.type}
      title={row.title}
      icon={<ItemIcon emoji={row.icon ?? MEMBER_KIND[row.type].icon} fallback={null} />}
      selected={selected}
      onSelect={() => onOpen(row.id)}
      footerStart={
        <>
          <UpdatedStamp at={row.updatedAt} />
          <span className="truncate text-xs text-muted-foreground">· {kindLabel(row.type)}</span>
        </>
      }
    />
  );
}
