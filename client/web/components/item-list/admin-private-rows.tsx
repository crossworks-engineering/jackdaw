'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminPrivateListRow } from '@mantle/client-types';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { adminSpace, type SpaceKind } from '@/lib/member-space';
import { PRIVATE_ID_PARAM } from '@/lib/admin-private';
import { MineItem } from '@/components/member/mine-item';
import { SpaceApiProvider } from '@/components/member/space-api';
import { ItemCard, ItemIcon, UpdatedStamp } from './item-card';
import { StatePill } from './state-pill';

/**
 * An admin's own private items INSIDE the kind's screen (item-list alignment,
 * D1): the brain lists answer them with `?state=all` as AdminPrivateListRow
 * rows (the `private` key holds the space row), merged in the list's order.
 * They wear the `private` pill, open in the admin-space item view, and are
 * addressed by `?pid=` so a link or "Keep private" lands on one.
 */

/** The State filter of an admin screen. The URL's default is `all`; the
 *  brain's is `brain` (older clients), so the screen always sends it. */
export type AdminListState = 'all' | 'brain' | 'private';

export const ADMIN_STATE_OPTIONS: readonly { value: AdminListState; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'brain', label: 'Brain' },
  { value: 'private', label: 'Private' },
];

export function adminStateOf(params: Pick<URLSearchParams, 'get'> | null): AdminListState {
  const v = params?.get('state');
  return v === 'brain' || v === 'private' ? v : 'all';
}

/** A row of the admin's own private item (not the brain's). */
export function isPrivateRow(row: object): row is AdminPrivateListRow {
  return 'private' in row && !!(row as { private?: unknown }).private;
}

/** The open private item (`?pid=`), and how to open or close one. Opening a
 *  private item is a replace (it is a selection, like the brain cards'). */
export function usePrivateOpen(): {
  pid: string | null;
  openPrivate: (id: string | null) => void;
} {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const pid = params.get(PRIVATE_ID_PARAM);
  const openPrivate = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (id) sp.set(PRIVATE_ID_PARAM, id);
      else sp.delete(PRIVATE_ID_PARAM);
      const s = sp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return { pid, openPrivate };
}

/** A private item's card: the kind's glyph, `private`, and who it was taken
 *  from when an admin took it over from the Review queue. No brain actions:
 *  its own view (accept, give back, delete) opens beside it. */
export function PrivateItemCard({
  row,
  selected,
  onSelect,
}: {
  row: AdminPrivateListRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const from = row.private.takenFrom?.name ?? null;
  return (
    <ItemCard
      id={row.id}
      kind={row.type}
      title={row.title}
      icon={<ItemIcon emoji={row.icon ?? MEMBER_KIND[row.type].icon} fallback={null} />}
      selected={selected}
      onSelect={onSelect}
      footerStart={
        <>
          {from ? (
            <span className="truncate px-1 py-0.5 text-xs text-muted-foreground">From {from}</span>
          ) : null}
          <UpdatedStamp at={row.updatedAt} />
        </>
      }
      pill={<StatePill state="private" />}
    />
  );
}

/** The detail pane for a private item: the admin-space item view (edit,
 *  save, accept into the brain, give back, delete). */
export function PrivateItemDetail({
  id,
  onClose,
}: {
  id: string;
  kind?: SpaceKind;
  onClose: () => void;
}) {
  return (
    <SpaceApiProvider client={adminSpace}>
      <MineItem id={id} onClose={onClose} />
    </SpaceApiProvider>
  );
}
