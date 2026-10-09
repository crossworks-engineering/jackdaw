/**
 * Settings > Logins > Client settings, the client storage card of the client logins C5
 * audit fixes, the pure half (pinned by client-spaces-admin.test.ts):
 * GET /api/team-admin/clients/storage, what the clients' own spaces hold
 * against the brain's caps, per client, and the quota refusals of the last
 * 7 days, so an admin can see why a client's upload fails and who fills the
 * total. (The client comments card is gone: the brain has no comments since
 * 2026-10-09.)
 *
 * A brain before the fix has no such route (404): the card is left out, and
 * nothing asks again in the page load (askUnlessMissing).
 */
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import type { ClientStorageUsage } from '@mantle/client-types';
import { formatBytes } from './upload-progress';

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

/** What the databases of the brain's client-level apps hold (clients write
 *  them), or null when the brain does not say (an older brain) or there are
 *  none. They do not count toward the client limits: each app file has its
 *  own cap. */
export function clientAppDbLine(u: Pick<ClientStorageUsage, 'clientAppDbBytes'>): string | null {
  if (!u.clientAppDbBytes) return null;
  return `Client apps' databases hold ${formatBytes(u.clientAppDbBytes)} (not counted above; each app has its own cap).`;
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

/** A row's name, as the brain gives it ("Former client..." for a deleted
 *  one, whose `loginId` is its space's id: no login to act on). */
export function storageRowName(row: Pick<ClientStorageUsage['rows'][number], 'name'>) {
  return row.name.trim() || 'A client';
}

/** What a deleted client's row adds: it still counts until the purge. */
export const FORMER_CLIENT_NOTE =
  'deleted: its private items are purged after 30 days, its submitted items count until you accept or discard them';

/** Each cap a refusal names, in an admin's words. */
const REFUSAL_LABEL: Record<string, string> = {
  'file-size': 'file over the size limit',
  storage: 'their space is full',
  total: 'all client spaces are full',
  'daily-upload': "the day's uploads are used up",
  'upload-no-room': 'no room for the upload',
  items: 'too many items',
  'submits-per-day': "the day's submissions are used up",
  'open-submissions': 'too many waiting for review',
  'comment-cap': "the day's comments are used up",
  'thread-full': 'the thread is full',
  'give-back': 'a give back found no room',
};

/** A refusal's cap in words; one this app does not know yet, as given. */
export function refusalReasonLabel(reason: string): string {
  return REFUSAL_LABEL[reason] ?? reason;
}

/** One refusal, in words: when, whose, and which cap. */
export function refusalLine(
  r: ClientStorageUsage['refusals'][number],
  rows: readonly Pick<ClientStorageUsage['rows'][number], 'loginId' | 'name'>[],
): string {
  const who = r.loginId
    ? (rows.find((x) => x.loginId === r.loginId)?.name.trim() ?? 'A client')
    : 'A client no longer here';
  return `${formatDateTime(r.at)} · ${who} · ${refusalReasonLabel(r.reason)}`;
}
