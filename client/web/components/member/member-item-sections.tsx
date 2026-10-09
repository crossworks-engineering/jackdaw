'use client';

/**
 * What a member's workspace shows above its folder tree (workspace review
 * pattern, 2026-10-09): the items the member's tree does not hold, as small
 * sections, each hidden while empty, the way /apps shows its review groups.
 *   - With admin: the member's own items an admin took over.
 *   - By me (accepted): what the member wrote that an admin accepted into
 *     the brain, at any level.
 *   - Client requests: clients' submitted items, read only.
 * Each reads the brain's one item list with that filter
 * (GET /api/member/items?state=, item-list alignment P4), and a row opens in
 * the workspace's own detail pane.
 */
import { useQueries } from '@tanstack/react-query';
import type { MemberItemRow } from '@mantle/client-types';
import { updatedAgo } from '@mantle/web-ui/lib/format-datetime';
import { Badge } from '@mantle/web-ui/ui/badge';
import { ItemIcon } from '@/components/item-list/item-card';
import { ReviewSections, type ReviewSection } from '@/components/review/workspace-review-sections';
import { authorName } from '@/lib/item-author';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { MEMBER_ITEM_SECTIONS, fetchMemberItems, srcOf } from '@/lib/member-items';
import { LIBRARY_CLIENT_TITLE, libraryLevelBadge, type SpaceKind } from '@/lib/member-space';

/** A row's key in the sections and in the workspace's selection: the same
 *  id can sit in two sources (a page of yours in the Library). */
export const sectionRowKey = (row: Pick<MemberItemRow, 'id' | 'source'>) =>
  `${srcOf(row.source)}:${row.id}`;

export type MemberSectionList = {
  id: string;
  title: string;
  rows: MemberItemRow[];
  total: number;
};

/**
 * The three lists for one kind, page 1 of each (newest first). Keyed under
 * `member-space-list`, so every own-item change and the member's event
 * stream refresh them as they refreshed the old list. A list that fails to
 * load shows as empty: the tree below stays the screen.
 */
export function useMemberSectionLists(kind: SpaceKind): MemberSectionList[] {
  const results = useQueries({
    queries: MEMBER_ITEM_SECTIONS.map((s) => ({
      queryKey: ['member-space-list', 'items', kind, { q: '', state: s.state, page: 1 }],
      queryFn: () => fetchMemberItems({ kind, state: s.state, page: 1 }),
    })),
  });
  return MEMBER_ITEM_SECTIONS.map((s, i) => {
    const data = results[i]?.data;
    return { id: s.id, title: s.title, rows: data?.items ?? [], total: data?.total ?? 0 };
  });
}

function meta(row: MemberItemRow): string {
  const when = updatedAgo(row.updatedAt);
  if (row.source === 'client-request' && row.author) return `${authorName(row.author)} · ${when}`;
  return when;
}

export function MemberItemSections({
  kind,
  lists,
  selectedKey,
  onOpen,
}: {
  kind: SpaceKind;
  lists: MemberSectionList[];
  selectedKey: string | null;
  onOpen: (row: MemberItemRow) => void;
}) {
  const info = MEMBER_KIND[kind];
  const sections: ReviewSection[] = lists.map((l) => ({
    id: l.id,
    title: l.title,
    count: l.total,
    foot:
      l.total > l.rows.length
        ? `The newest ${l.rows.length} of ${l.total} ${info.many}.`
        : undefined,
    rows: l.rows.map((row) => {
      const level = libraryLevelBadge(row.audience);
      return {
        id: sectionRowKey(row),
        title: row.title,
        meta: meta(row),
        lead: <ItemIcon emoji={row.icon ?? info.icon} fallback={null} />,
        badge: level ? (
          <Badge variant="outline" className="shrink-0" title={LIBRARY_CLIENT_TITLE}>
            {level}
          </Badge>
        ) : undefined,
        onSelect: () => onOpen(row),
      };
    }),
  }));
  return <ReviewSections sections={sections} selectedId={selectedKey} collapsible />;
}
