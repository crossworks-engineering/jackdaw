/**
 * The client thread on the owner's side (client logins C5 audit fix U2):
 * an item at CLIENT level carries a thread every client login reads and
 * writes (decision 8); an admin reads and answers it from the item itself,
 * on the owner's own comment routes (GET/POST /api/nodes/:id/comments,
 * DELETE /api/comments/:id). A comment an admin writes there while the item
 * is at client level joins the client thread under the admin's name.
 *
 * The pure half, pinned by owner-client-thread.test.ts; the button and its
 * panel are components/share/owner-client-thread.tsx.
 */
import type { AccessLevel, NodeCommentAuthorKind } from '@mantle/client-types';
import { queryKeysForType } from './access-levels';

/** The kinds whose owner views carry the thread. */
export type OwnerThreadKind = 'page' | 'note' | 'table' | 'file';

/** The owner's thread route for an item (paged: use-thread-pages.ts). */
export function ownerThreadPath(id: string): string {
  return `/api/nodes/${encodeURIComponent(id)}/comments`;
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

/** Is the thread for this item: only at client level. */
export function showsClientThread(level: AccessLevel | null | undefined): boolean {
  return level === 'client';
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
