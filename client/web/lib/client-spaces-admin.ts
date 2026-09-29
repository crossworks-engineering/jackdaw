/**
 * Team admin > Clients, two cards of the client logins C5 audit fixes, the
 * pure half (pinned by client-spaces-admin.test.ts):
 *
 * - Client storage (GET /api/team-admin/clients/storage): what the
 *   clients' own spaces hold against the brain's caps, per client, and the
 *   quota refusals of the last 7 days, so an admin can see why a client's
 *   upload fails and who fills the total.
 * - Client comments (GET /api/team-admin/clients/comments?days=7): the
 *   items at client level whose client thread had a CLIENT comment this
 *   week, newest first, each a link to the item, where the thread is
 *   (components/share/owner-client-thread.tsx); and, on each client login,
 *   "Delete this client's comments" (DELETE
 *   /api/team-admin/clients/:id/comments).
 *
 * A brain before the fix has none of these routes (404): the cards are
 * left out, the action is not offered, and nothing asks again in the page
 * load (askUnlessMissing).
 */
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import type { ClientLoginRow } from '@mantle/client-types';
import type { ClientStorageUsage, ClientThreadActivity } from './contract-next';
import { formatBytes } from './upload-progress';
import { clientName } from './client-logins';

// ── Client storage ──────────────────────────────────────────────────────────

export const CLIENT_STORAGE_PATH = '/api/team-admin/clients/storage';
export const CLIENT_STORAGE_KEY = ['team-admin', 'client-storage'] as const;

/** Used of a cap, from 90% on: the line turns to a warning. */
export function nearCap(used: number, cap: number): boolean {
  return cap > 0 && used >= cap * 0.9;
}

/** "1.2 GB of 5.00 GB used by all client spaces". */
export function storageTotalLine(u: Pick<ClientStorageUsage, 'totalUsedBytes' | 'limits'>) {
  return `${formatBytes(u.totalUsedBytes)} of ${formatBytes(u.limits.totalBytes)} used by all client spaces`;
}

/** The card's line under the total: each client's caps, in words. */
export function storageLimitsText(limits: ClientStorageUsage['limits']): string {
  return (
    `Each client may keep ${formatBytes(limits.perClientBytes)} and ${limits.itemLimit} items, ` +
    `upload ${formatBytes(limits.dailyUploadBytes)} a day (${formatBytes(limits.fileMaxBytes)} a file), ` +
    `and submit ${limits.submitsPerDay} a day with ${limits.openSubmissions} waiting at most.`
  );
}

/** "12 MB of 200 MB · 34 of 500 items · 2 waiting for review · 3.0 MB today". */
export function storageRowLine(
  row: ClientStorageUsage['rows'][number],
  limits: ClientStorageUsage['limits'],
): string {
  const parts = [
    `${formatBytes(row.usedBytes)} of ${formatBytes(limits.perClientBytes)}`,
    `${row.items} of ${limits.itemLimit} items`,
  ];
  if (row.openSubmissions > 0) parts.push(`${row.openSubmissions} waiting for review`);
  if (row.uploadedTodayBytes > 0)
    parts.push(`${formatBytes(row.uploadedTodayBytes)} uploaded today`);
  return parts.join(' · ');
}

/** A row's name: a deleted client still counts until its space is purged. */
export function storageRowName(row: Pick<ClientStorageUsage['rows'][number], 'name' | 'former'>) {
  const name = row.name.trim() || 'A client';
  return row.former ? `${name} (deleted, purged after 30 days)` : name;
}

/** One refusal, in words: when, whose, and which cap ("client-total" reads
 *  "client total"). */
export function refusalLine(
  r: ClientStorageUsage['refusals'][number],
  rows: readonly Pick<ClientStorageUsage['rows'][number], 'loginId' | 'name'>[],
): string {
  const who = r.loginId
    ? (rows.find((x) => x.loginId === r.loginId)?.name.trim() ?? 'A client')
    : 'A client no longer here';
  return `${formatDateTime(r.at)} · ${who} · ${r.reason.replace(/[-_]+/g, ' ')}`;
}

// ── Client comments ─────────────────────────────────────────────────────────

/** The week the card covers. */
export const CLIENT_COMMENTS_DAYS = 7;
export const CLIENT_COMMENTS_ROUTE = '/api/team-admin/clients/comments';
export const CLIENT_COMMENTS_PATH = `${CLIENT_COMMENTS_ROUTE}?days=${CLIENT_COMMENTS_DAYS}`;
export const CLIENT_COMMENTS_ADMIN_KEY = ['team-admin', 'client-comments'] as const;

/** Every comment one client login wrote. */
export function clientCommentsPath(loginId: string): string {
  return `/api/team-admin/clients/${encodeURIComponent(loginId)}/comments`;
}

/** Where a row opens: the item's own screen, where the thread is. */
export function commentItemHref(nodeId: string): string {
  return `/n/${encodeURIComponent(nodeId)}`;
}

/** "3 client comments · the last by Pat Client, 29 Sep 2026, 14:00". */
export function commentRowLine(row: ClientThreadActivity['rows'][number]): string {
  const n = row.clientComments;
  const count = `${n} client comment${n === 1 ? '' : 's'}`;
  return `${count} · the last by ${row.lastClientName.trim() || 'a client'}, ${formatDateTime(row.lastCommentAt)}`;
}

/** What the card says with no rows. */
export const CLIENT_COMMENTS_EMPTY = `No client has commented in the last ${CLIENT_COMMENTS_DAYS} days.`;

/** The toast after "Delete this client's comments". */
export function deletedCommentsText(
  row: Pick<ClientLoginRow, 'displayName' | 'email'>,
  deleted: number,
): string {
  const name = clientName(row);
  if (deleted === 0) return `${name} had no comments to delete.`;
  return `Deleted ${deleted} comment${deleted === 1 ? '' : 's'} by ${name}.`;
}
