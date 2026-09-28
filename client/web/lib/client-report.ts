/**
 * "What clients see" (client logins C1): every item at client level, which
 * every client login will be able to read, and the admin's acknowledgement
 * that they checked the list. Adding a client login stays disabled on the
 * brain until the newest acknowledgement covers every client-level item
 * (C2), so the Team admin tab asks again whenever something went to client
 * after the last one.
 *
 * API (admin only): GET /api/access/client-report -> ClientReport;
 * POST /api/access/client-report/ack { itemIds } -> ClientReportAckResponse,
 * `itemIds` being exactly the items the admin was shown.
 *
 * Pure apart from the two calls, so the words and the ack are unit-tested
 * (client-report.test.ts).
 */
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { LEVEL_LABEL } from './access-levels';
import type {
  ClientReport,
  ClientReportAck,
  ClientReportAckResponse,
  ClientReportRef,
} from '@mantle/client-types';

export const CLIENT_REPORT_KEY = ['team-admin', 'client-report'] as const;

export function fetchClientReport(): Promise<ClientReport> {
  return apiFetch<ClientReport>('/api/access/client-report');
}

/** The ids on the screen: what the admin acknowledges having checked. */
export function shownIds(report: ClientReport): string[] {
  return report.items.map((i) => i.id);
}

/** Record that the admin checked the list they were shown. */
export function acknowledgeClientReport(itemIds: string[]): Promise<ClientReportAckResponse> {
  return apiSend<ClientReportAckResponse>('/api/access/client-report/ack', 'POST', { itemIds });
}

/** The report as the ack leaves it: the new acknowledgement, and nothing
 *  that was shown still counted as new. A refetch follows; this only keeps
 *  the screen from showing the old answer meanwhile. */
export function afterAck(
  report: ClientReport,
  res: ClientReportAckResponse,
  itemIds: readonly string[],
): ClientReport {
  const shown = new Set(itemIds);
  return {
    ...report,
    acknowledgement: res.acknowledgement,
    acknowledged: res.acknowledged,
    newSinceAck: report.newSinceAck.filter((id) => !shown.has(id)),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Who acknowledged the list, and when. */
export function ackLine(ack: ClientReportAck): string {
  const who = ack.ackedBy?.name || 'An admin who has since been removed';
  return `${who} checked this list on ${formatDateTime(ack.ackedAt)} (${plural(ack.itemCount, 'item')}).`;
}

/** Items that went to client after the newest acknowledgement. */
export function newSinceLine(count: number): string {
  return `${plural(count, 'item')} went to client since then. Check the list again.`;
}

/** How a report's list is cut short (it stops at 2000 items). */
export function shownLine(report: ClientReport): string | null {
  return report.total > report.items.length
    ? `Showing ${report.items.length} of ${report.total} client items.`
    : null;
}

/** One item a client item names but a client may not read, in words. */
export function refLabel(ref: ClientReportRef): string {
  const title = ref.title?.trim() || 'Untitled';
  if (ref.audience) return `${title} (${LEVEL_LABEL[ref.audience]})`;
  return ref.type ? `${title} (not in the brain)` : 'An item that is gone';
}

/** An old link's views, in words. */
export function linkViewsLine(link: NonNullable<ClientReport['items'][number]['link']>): string {
  const views = plural(link.viewCount, 'view');
  return link.lastViewedAt ? `${views}, last ${formatDateTime(link.lastViewedAt)}` : views;
}
