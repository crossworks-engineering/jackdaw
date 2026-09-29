/**
 * Shared links (Team admin) and the link revoke the Access control reuses.
 * Every live link is an open one; its item's level says what kind:
 * - public: the one level that makes a link now;
 * - client: an OLD client link, from when client meant "anyone with the
 *   link", live until a later phase retires it (never offered for copy);
 * - admin: an OLD open link on an item that stays admin (a task, an event):
 *   it still opens until it is revoked.
 *
 * The level rides on each GET /api/team-admin/shares row on a current brain.
 * An older brain's rows carry none, and then it comes from GET
 * /api/shares/all (client logins C1); a brain before C1 has it nowhere.
 *
 * Pure apart from the revoke call, so the rules are unit-tested
 * (shared-links.test.ts).
 */
import type { QueryClient } from '@tanstack/react-query';
import type { AccessLevel } from '@mantle/client-types';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { LEVEL_LABEL, isOldClientLink } from './access-levels';

/** The Shared links tab's query (GET /api/team-admin/shares). */
export const SHARES_KEY = ['team-admin', 'shares'] as const;

/** Each link's level from GET /api/shares/all, for an older brain whose
 *  Shared links rows carry none. */
export const SHARE_LEVELS_KEY = ['team-admin', 'share-levels'] as const;

/** Whether the level has to come from the second call: only when some row
 *  came without one (a brain before the level rode on the rows). */
export function needsLevelLookup(rows: readonly { level?: AccessLevel }[]): boolean {
  return rows.some((r) => !r.level);
}

/** Copy is offered for a link that is meant to be handed out. An old client
 *  link is not: clients sign in instead. */
export function canCopyLink(level: AccessLevel | undefined): boolean {
  return !isOldClientLink(level);
}

/** A live link on an admin item: an old open link on a kind that stays admin. */
export const OLD_ADMIN_LINK = 'Admin (old open link)';

/** The level badge beside a link. */
export function linkLevelLabel(level: AccessLevel): string {
  return level === 'admin' ? OLD_ADMIN_LINK : LEVEL_LABEL[level];
}

/** What the list says when the levels could not be loaded (older brains). */
export const LEVELS_FAILED = 'Could not load the level of each link.';

/** Revoke one link (and its sub-pages' links when it cascades). The item
 *  keeps its level. */
export async function revokeShareLink(shareId: string): Promise<void> {
  await apiSend(`/api/shares/${encodeURIComponent(shareId)}`, 'DELETE');
}

/** After a revoke or a level change: Shared links and its levels reload. */
export function invalidateLinkQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: SHARES_KEY });
  void queryClient.invalidateQueries({ queryKey: SHARE_LEVELS_KEY });
}
