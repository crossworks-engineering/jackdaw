/**
 * "What clients see" (client logins C1): every item at client level, which
 * every client login will be able to read, and the admin's acknowledgement
 * that they checked the list. Adding a client login stays disabled on the
 * brain until the newest acknowledgement covers every client-level item
 * (C2), so the Team admin tab asks again whenever something went to client
 * after the last one.
 *
 * API (admin only): GET /api/access/client-report -> ClientReport;
 * POST /api/access/client-report/ack -> ClientReportAckResponse. The ack
 * sends the report's `fingerprint` (the whole client set, not only the 2000
 * shown) when the brain gives one; the brain recomputes it and answers 409
 * `report-changed` when the set moved meanwhile. A brain before the
 * fingerprint gets `{ itemIds }`, exactly the items the admin was shown.
 *
 * Pure apart from the two calls, so the words and the ack are unit-tested
 * (client-report.test.ts).
 */
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { LEVEL_LABEL } from './access-levels';
import type {
  ClientReportAck,
  ClientReportAckResponse,
  ClientReportRef,
} from '@mantle/client-types';
import type { ClientOldLinkAbove, ClientReport, ClientReportAckBody } from './contract-next';

export const CLIENT_REPORT_KEY = ['team-admin', 'client-report'] as const;

export function fetchClientReport(): Promise<ClientReport> {
  return apiFetch<ClientReport>('/api/access/client-report');
}

/** A brain before client logins C1 has no report route (404): the tab says
 *  so plainly, and hides itself from the strip, rather than show an error. */
export function isReportMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export const NOT_ON_THIS_BRAIN = 'This brain does not have this yet.';

/** The ids on the screen. */
export function shownIds(report: ClientReport): string[] {
  return report.items.map((i) => i.id);
}

/** What the acknowledgement sends: the report's fingerprint (the whole
 *  client set, which the brain checks is still current), or on a brain
 *  without one the ids on the screen. */
export function ackBody(report: ClientReport): ClientReportAckBody {
  return report.fingerprint ? { fingerprint: report.fingerprint } : { itemIds: shownIds(report) };
}

/** Record that the admin checked the list they were shown. */
export function acknowledgeClientReport(
  body: ClientReportAckBody,
): Promise<ClientReportAckResponse> {
  return apiSend<ClientReportAckResponse>('/api/access/client-report/ack', 'POST', body);
}

/** The brain refused the ack because the client set changed after the report
 *  was loaded (409 `report-changed`): reload it and ask again. */
export function isReportChanged(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.body?.reason === 'report-changed';
}

/** What the admin is told when the list changed under them. */
export const REPORT_CHANGED =
  'The list changed while you were checking it. It has been reloaded: check it again.';

/** The report as the ack leaves it: the new acknowledgement, and nothing it
 *  covered still counted as new (everything, for a fingerprint; the ids sent,
 *  otherwise). A refetch follows; this only keeps the screen from showing the
 *  old answer meanwhile. */
export function afterAck(
  report: ClientReport,
  res: ClientReportAckResponse,
  body: ClientReportAckBody,
): ClientReport {
  const covered = 'itemIds' in body ? new Set(body.itemIds) : null;
  return {
    ...report,
    acknowledgement: res.acknowledgement,
    acknowledged: res.acknowledged,
    newSinceAck: covered ? report.newSinceAck.filter((id) => !covered.has(id)) : [],
  };
}

/** The items marked "New since checked": only once someone has checked the
 *  list (before that the brain names every item, and every one is simply
 *  unchecked). A Set, for one lookup per row. */
export function newSinceIds(report: ClientReport): ReadonlySet<string> {
  return report.acknowledgement ? new Set(report.newSinceAck) : new Set();
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Who acknowledged the list, and when. */
export function ackLine(ack: ClientReportAck): string {
  const who = ack.ackedBy?.name || 'An admin who has since been removed';
  return `${who} checked this list on ${formatDateTime(ack.ackedAt)} (${plural(ack.itemCount, 'item')}).`;
}

/** Items that went to client after the newest acknowledgement, telling the
 *  ones on this list from the ones past its 2000 (not shown here). */
export function newSinceLine(report: ClientReport): string {
  const shown = new Set(shownIds(report));
  const count = report.newSinceAck.length;
  const hidden = report.newSinceAck.filter((id) => !shown.has(id)).length;
  const past =
    hidden === 0
      ? ''
      : hidden === count
        ? ` ${count === 1 ? 'It is' : 'They are'} past the ${report.items.length} shown here.`
        : ` ${hidden} of them ${hidden === 1 ? 'is' : 'are'} past the ${report.items.length} shown here.`;
  return `${plural(count, 'item')} went to client since then.${past} Check the list again.`;
}

/** How a report's list is cut short (it stops at 2000 items), and what the
 *  check covers: with a fingerprint the whole set, else only what is shown. */
export function shownLine(report: ClientReport): string | null {
  if (report.total <= report.items.length) return null;
  const head = `Showing ${report.items.length} of ${report.total} client items.`;
  return report.fingerprint
    ? `${head} Checking the list covers all ${report.total}.`
    : `${head} Only the ones shown can be checked on this brain.`;
}

/** One item a client item names but a client may not read, in words. Only a
 *  brain item has a level; anything else (a personal item, or one that is
 *  gone) is "An item outside the brain", never its title. */
export function refLabel(ref: ClientReportRef): string {
  if (!ref.audience || ref.title === null) return OUTSIDE_THE_BRAIN;
  return `${ref.title.trim() || 'Untitled'} (${LEVEL_LABEL[ref.audience]})`;
}

export const OUTSIDE_THE_BRAIN = 'An item outside the brain';

/** An old live link above a client item (a folder that holds it, a page that
 *  embeds it), in words: anyone with that link can open this item too. */
export function oldLinkAboveLine(link: ClientOldLinkAbove): string {
  const what = link.via === 'folder' ? 'folder' : 'page';
  return `Reachable through the old link on the ${what} ${link.title.trim() || 'Untitled'}`;
}

/** Shared links, opened at one link. */
export function sharedLinkHref(shareId: string): string {
  return `/team-admin?view=shares&share=${encodeURIComponent(shareId)}`;
}

/** An old link's views, in words. */
export function linkViewsLine(link: NonNullable<ClientReport['items'][number]['link']>): string {
  const views = plural(link.viewCount, 'view');
  return link.lastViewedAt ? `${views}, last ${formatDateTime(link.lastViewedAt)}` : views;
}
