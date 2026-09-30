/**
 * The client thread on the owner's side (client logins C5 audit fix U2):
 * an item at CLIENT level carries a thread every client login reads and
 * writes (decision 8); an admin reads and answers it from the item itself,
 * on the owner's own comment routes (GET /api/nodes/:id/comments?scope=client
 * since C6, POST /api/nodes/:id/comments, DELETE /api/comments/:id). A comment an admin writes there while the item
 * is at client level joins the client thread under the admin's name.
 *
 * The pure half, pinned by owner-client-thread.test.ts; the button and its
 * panel are components/share/owner-client-thread.tsx.
 */
import type { AccessLevel, NodeCommentAuthorKind } from '@mantle/client-types';
import { queryKeysForType } from './access-levels';
/** The owner comment route's `?scope=` (C6): only the client thread. */
export type NodeCommentScope = 'client';

/**
 * The kinds whose owner views carry the thread: every workspace kind the
 * brain threads at client level (its 0159 kind list), so no client comment
 * lands where no admin screen shows it. OWNER_THREAD_KINDS lists them for
 * the guard test that each has a mount.
 */
export const OWNER_THREAD_KINDS = ['page', 'note', 'table', 'file', 'draw'] as const;
export type OwnerThreadKind = (typeof OWNER_THREAD_KINDS)[number];

/** The owner's thread route for an item: where a comment is POSTed. */
export function ownerThreadPath(id: string): string {
  return `/api/nodes/${encodeURIComponent(id)}/comments`;
}

/**
 * Where the client thread is READ (paged: use-thread-pages.ts): the owner's
 * route asked for the client scope only (C6), so the panel shows the client
 * thread and nothing an item's other threads hold. A brain before C6
 * ignores `scope` and answers every scope, as it always did: the panel then
 * shows what it showed before.
 */
export function ownerClientThreadPath(id: string): string {
  const scope: NodeCommentScope = 'client';
  return `${ownerThreadPath(id)}?scope=${scope}`;
}

/** One comment, for its delete (any admin login may delete any comment). */
export function ownerCommentPath(commentId: string): string {
  return `/api/comments/${encodeURIComponent(commentId)}`;
}

export const OWNER_THREAD_KEY = ['owner-client-thread'] as const;

/**
 * Where the item's level is kept when the view does not know it: under the
 * kind's own list key, so the Access control's change of level (which
 * invalidates that key) asks it again, and the thread shows or goes.
 */
export function ownerLevelKey(type: OwnerThreadKind, id: string): readonly unknown[] {
  const [list] = queryKeysForType(type);
  return [...(list ?? [type]), 'client-thread-level', id];
}

/**
 * Is the thread for this item: when clients read it, by its own level or by
 * a folder shared with clients above it (the brain's union rule, folder plan
 * phase 4: an item in a client-shared folder carries the client thread
 * whatever its own level, a public one included).
 */
export function showsClientThread(
  level: AccessLevel | null | undefined,
  inherited?: 'team' | 'client' | null,
): boolean {
  return level === 'client' || inherited === 'client';
}

/** What the view must still ask the Access route for: nothing when it knows
 *  both the level and the inherited share, or the level alone already opens
 *  the thread. */
export function threadLevelUnknown(
  audience: AccessLevel | null | undefined,
  inherited: 'team' | 'client' | null | undefined,
): boolean {
  if (audience === undefined) return true;
  return inherited === undefined && audience !== 'client';
}

/** The chip beside an author, owner side: the forum's vocabulary (a login's
 *  name speaks for itself; a member is the team; a client is marked). */
export const OWNER_THREAD_CHIPS: Record<NodeCommentAuthorKind, string | null> = {
  owner: null,
  member: 'Team',
  agent: 'Assistant',
  client: 'Client',
};

/** What the panel says first: who reads what is written here. */
export const CLIENT_THREAD_LINE =
  'Clients read this thread: every client login sees what is written here while the item is at Client level, under the writer’s name.';

/** The button's words: the count read so far, "+" when older ones wait. */
export function clientThreadLabel(count: number, hasMore: boolean): string {
  if (count === 0) return 'Client comments';
  return `Client comments (${count}${hasMore ? '+' : ''})`;
}
