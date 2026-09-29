/**
 * Wire types the brain is about to have and the pinned contract does not yet
 * (client logins C5: a client's own items, My requests; the comment threads
 * on client items; a client's submitted items in the member one list). This
 * app pins @crossworks/client-types@0.232.336, which predates them; the C5
 * release publishes them.
 *
 * Every NEW field on a published type is optional, and every new route is
 * asked so that a 404 from an older brain shows nothing broken: this app must
 * work against a brain that does not have them yet.
 *
 * Temporary: drop when the pin reaches the C5 release. Delete this file and
 * import each name from '@mantle/client-types' instead (the runtime
 * constants from '@mantle/client-types/member-kinds'): every import of
 * '@/lib/contract-next' or './contract-next' becomes one of those.
 */
import type {
  MemberItemFilter as PublishedMemberItemFilter,
  MemberItemPill,
  MemberItemRow as PublishedMemberItemRow,
  MemberItemsPage as PublishedMemberItemsPage,
  MemberSpaceItemRow,
  NodeComment as PublishedNodeComment,
} from '@mantle/client-types';

// ── member-kinds.ts ─────────────────────────────────────────────────────────

/** The kinds a CLIENT works with in their own space: pages and notes they
 *  write, files they upload. */
export const CLIENT_ITEM_KINDS = ['page', 'note', 'file'] as const;
export type ClientItemKind = (typeof CLIENT_ITEM_KINDS)[number];

export function isClientItemKind(v: unknown): v is ClientItemKind {
  return typeof v === 'string' && (CLIENT_ITEM_KINDS as readonly string[]).includes(v);
}

/** The State filter of a client's one list, My requests (GET
 *  /api/client/items?state=): `all`, one row pill, or `accepted`. */
export const CLIENT_ITEM_FILTERS = [
  'all',
  'private',
  'submitted',
  'returned',
  'with-admin',
  'accepted',
] as const;
export type ClientItemFilter = (typeof CLIENT_ITEM_FILTERS)[number];

export function isClientItemFilter(v: unknown): v is ClientItemFilter {
  return typeof v === 'string' && (CLIENT_ITEM_FILTERS as readonly string[]).includes(v);
}

/** The member State filter gains `client-requests` (a client's submitted
 *  items, read only). */
export type MemberItemFilter = PublishedMemberItemFilter | 'client-requests';

// ── dto/rows.ts ─────────────────────────────────────────────────────────────

/** A comment's author kind gains `client`. */
export type NodeCommentAuthorKind = PublishedNodeComment['authorKind'] | 'client';
export type NodeComment = Omit<PublishedNodeComment, 'authorKind'> & {
  authorKind: NodeCommentAuthorKind;
};

// ── dto/member.ts ───────────────────────────────────────────────────────────

/** Where a row of the member one list comes from, plus `client-request`: a
 *  client's SUBMITTED item, read only from /api/member/client-requests/:id;
 *  its `space` row carries the review state, its `author` the client (role
 *  `client`). */
export type MemberItemSource = PublishedMemberItemRow['source'] | 'client-request';
export type MemberItemRow = Omit<PublishedMemberItemRow, 'source'> & { source: MemberItemSource };
export type MemberItemsPage = Omit<PublishedMemberItemsPage, 'items'> & { items: MemberItemRow[] };

// ── dto/client.ts: My requests ──────────────────────────────────────────────

/** Where a row of My requests comes from: `own` an item in the client's own
 *  space (GET /api/client/space/:id), `accepted` the version the client wrote
 *  and an admin accepted (GET /api/client/accepted/:id). */
export type ClientItemSource = 'own' | 'accepted';

/** One row of GET /api/client/items. No level, no staff name. */
export type ClientItemRow = {
  id: string;
  type: ClientItemKind;
  title: string;
  icon: string | null;
  updatedAt: string;
  source: ClientItemSource;
  /** `private` a draft, `submitted`, `returned`, `with-admin`; null on an
   *  accepted row. Never `draft` (a client never shares with the team). */
  pill: MemberItemPill | null;
  /** The space row of an own item (review state, the returned note). */
  space: MemberSpaceItemRow | null;
  acceptedAt: string | null;
};

/** GET /api/client/items?kind=&q=&state=&page= */
export type ClientItemsPage = {
  items: ClientItemRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** The 409 `reason` of a client space refusal: the member ones, plus `quota`
 *  for the client caps (20 MB a file, 200 MB a client, 50 MB uploaded a day,
 *  500 items, 10 submissions a day, 50 waiting for review). */
export type ClientSpaceRefusedReason =
  | 'not-found'
  | 'frozen'
  | 'not-draft'
  | 'not-submitted'
  | 'unsaved-draft'
  | 'quota'
  | 'embed'
  | 'not-shared'
  | 'too-large'
  | 'invalid'
  | 'with-admin';

export type ClientAcceptedBase = {
  id: string;
  title: string;
  icon: string | null;
  acceptedAt: string | null;
  updatedAt: string;
};

/** GET /api/client/accepted/:id -> { item }: the version the client wrote
 *  and an admin accepted. A file's bytes: /api/client/files/:id while the
 *  brain file still holds the bytes accepted (`changedByAdmin` otherwise). */
export type ClientAcceptedItem =
  | (ClientAcceptedBase & { type: 'page'; doc: unknown })
  | (ClientAcceptedBase & { type: 'note'; content: string })
  | (ClientAcceptedBase & {
      type: 'file';
      filename: string;
      mimeType: string | null;
      sizeBytes: number | null;
      changedByAdmin?: boolean;
    });

/** GET /api/client/shared/:id/comments and /api/client/space/:id/comments
 *  (and the member's /api/member/library/:id/comments): one thread. */
export type ClientCommentThread = { comments: NodeComment[] };
