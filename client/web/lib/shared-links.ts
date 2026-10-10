/**
 * Shared links (Team admin) and the link revoke the Access control reuses.
 * Every live link is an open one; its item's level says what kind:
 * - public: the one level that makes a link now;
 * - client: an OLD client link, from when client meant "anyone with the
 *   link" (never offered for copy). Client logins C3 retired them all
 *   (brain migration 0192), so only a brain before C3 lists one;
 * - admin: an OLD open link on an item that stays admin (a task, an event):
 *   it still opens until it is revoked.
 *
 * A W5b2 brain sends no level on the rows (a link follows no level,
 * contract 30): no badge shows then, and nothing asks /api/shares/all for
 * one. An older brain's row level still shows.
 *
 * Next to the live links a C3 brain sends `retired`: the old client links it
 * retired. They have no token (the link is dead and asks its visitor to sign
 * in as a client), so they are listed, never copied or opened. A brain
 * before C3 sends no `retired`, which reads as none.
 *
 * Pure apart from the revoke call, so the rules are unit-tested
 * (shared-links.test.ts).
 */
import type { QueryClient } from '@tanstack/react-query';
import type { AccessLevel } from '@mantle/client-types';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import { LEVEL_LABEL, isOldClientLink, kindLabel } from './access-levels';
import { WHAT_CLIENTS_SEE, loginsHref } from './logins-nav';
import type { RetiredClientLinkRow } from '@mantle/client-types';

/** The Shared links tab's query (GET /api/team-admin/shares). */
export const SHARES_KEY = ['team-admin', 'shares'] as const;

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

/** Revoke one link. The item
 *  keeps its level. */
export async function revokeShareLink(shareId: string): Promise<void> {
  await apiSend(`/api/shares/${encodeURIComponent(shareId)}`, 'DELETE');
}

/** After a revoke or a link change: Shared links reloads,
 *  and the contacts (a contact share's revoke shows on the contact's
 *  "Shared" tab and share count, brain migration 0214). */
export function invalidateLinkQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: SHARES_KEY });
  void queryClient.invalidateQueries({ queryKey: ['contacts'] });
}

// ── Retired client links (client logins C3) ─────────────────────────────────

/** Settings > Logins > Clients (its first step), where the people who used a retired link are added
 *  as client logins. */
export const CLIENTS_HREF = loginsHref(WHAT_CLIENTS_SEE);

/** The old client links the brain retired, from the Shared links answer. A
 *  brain before C3 sends no `retired`: none. */
export function retiredLinksOf(data: {
  retired?: readonly RetiredClientLinkRow[] | null;
}): readonly RetiredClientLinkRow[] {
  return Array.isArray(data.retired) ? data.retired : [];
}

/** The retired link's item in the owner app (the universal permalink). */
export function retiredItemHref(row: Pick<RetiredClientLinkRow, 'nodeId'>): string {
  return `/n/${encodeURIComponent(row.nodeId)}`;
}

/** When the link was retired, in words. */
export function retiredOnLine(row: Pick<RetiredClientLinkRow, 'retiredAt'>): string {
  return row.retiredAt ? `retired ${formatDate(row.retiredAt)}` : 'retired';
}

/** How much the link was used before it retired, in words. */
export function retiredViewsLine(
  row: Pick<RetiredClientLinkRow, 'viewCount' | 'lastViewedAt'>,
): string {
  const views = `${row.viewCount} view${row.viewCount === 1 ? '' : 's'}`;
  return row.lastViewedAt ? `${views}, last ${formatDate(row.lastViewedAt)}` : views;
}

/** The item and its level now (client, unless an admin changed it since). */
export function retiredLevelLine(row: Pick<RetiredClientLinkRow, 'nodeType' | 'level'>): string {
  return `${kindLabel(row.nodeType)} now at ${LEVEL_LABEL[row.level] ?? row.level}`;
}
