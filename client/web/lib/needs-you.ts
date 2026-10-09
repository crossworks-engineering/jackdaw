/**
 * "Needs you": what waits for an admin (Review submissions, open team
 * requests, locked contacts, and embedding or extraction outages), shared by the rail notice, the toast, the tab title and
 * favicon, the browser notification and the desktop dock. The numbers come
 * from the brain's count endpoint (GET /api/team-admin/needs-you), so every
 * window and device shows the same; the owner live stream sends
 * `needs_you` when they may have moved. Pure helpers only: no DOM here.
 */
import type { NeedsYou, NeedsYouItem } from '@mantle/client-types';
import {
  alertHeadline,
  alertHref,
  alertKey,
  alertTitle,
  providerAlertsOf,
  type ProviderAlert,
} from './provider-alerts';
import { reviewItemHref } from './workspace-review';

export type { NeedsYou, NeedsYouItem };

export const NEEDS_YOU_KEY = ['needs-you'] as const;
/** The change type the owner live stream sends (mantle migration 0186). */
export const NEEDS_YOU_REALTIME_TYPE = 'needs_you';

/** Review lives in each workspace since 2026-10-09 (workspace review
 *  pattern): /review forwards to the first workspace with something waiting,
 *  or to the item it names. */
export const REVIEW_HREF = '/review';
export const REQUESTS_HREF = '/team-admin?view=requests';

/** Submitted items only, as the old Review tab badge counted: what
 *  deactivated logins left behind is not urgent (it stays in the list). The
 *  rail, the tab badge and the dock all count this. */
export const reviewWaiting = (n: NeedsYou | null | undefined): number =>
  n ? n.review.submitted : 0;

export const requestsOpen = (n: NeedsYou | null | undefined): number => (n ? n.requests.open : 0);

/** Contacts whose sharing locked after too many wrong codes (contact
 *  shares, brain migration 0214). A brain before 0214 sends no `sharing`. */
export const sharingLocked = (n: NeedsYou | null | undefined): number => n?.sharing?.locked ?? 0;

/** Embedding or extraction outages (brain migration 0230). */
export const providersFailing = (n: NeedsYou | null | undefined): number =>
  providerAlertsOf(n).length;

export const totalWaiting = (n: NeedsYou | null | undefined): number =>
  reviewWaiting(n) + requestsOpen(n) + sharingLocked(n) + providersFailing(n);

/** The rail notice: "2 waiting for review", "1 open request", "1 contact
 *  locked", or several. */
export function needsYouLabel(n: NeedsYou | null | undefined): string | null {
  const review = reviewWaiting(n);
  const requests = requestsOpen(n);
  const locked = sharingLocked(n);
  const parts: string[] = [];
  if (review > 0) parts.push(`${review} waiting for review`);
  if (requests > 0) parts.push(`${requests} open request${requests === 1 ? '' : 's'}`);
  if (locked > 0) parts.push(`${locked} contact${locked === 1 ? '' : 's'} locked`);
  return parts.length ? parts.join(' · ') : null;
}

/** Where the notice goes: Review first, since members wait on it; then
 *  Requests; a locked contact alone opens that contact. */
export function needsYouHref(n: NeedsYou | null | undefined): string {
  if (reviewWaiting(n) > 0) return REVIEW_HREF;
  if (requestsOpen(n) > 0) return REQUESTS_HREF;
  const locked = n?.sharing?.newest;
  if (sharingLocked(n) > 0 && locked) return `/contacts?id=${encodeURIComponent(locked.id)}`;
  return REVIEW_HREF;
}

export type Arrival =
  | { kind: 'review' | 'request'; item: NeedsYouItem }
  | { kind: 'provider'; item: NeedsYouItem; alert: ProviderAlert };

const keyOf = (item: NeedsYouItem | null) => (item ? `${item.id}@${item.at}` : null);

/**
 * What arrived between two answers, newest first: a queue whose newest item
 * changed to one that started waiting later than the previous newest. A
 * queue that only shrank (recall, return, accept, a closed request) keeps an
 * older newest item, or none, and announces nothing. No previous answer
 * (the first load) announces nothing: only what arrives while you are here.
 */
export function arrivals(prev: NeedsYou | null, next: NeedsYou): Arrival[] {
  if (!prev) return [];
  const out: Arrival[] = [];
  const pick = (
    kind: 'review' | 'request',
    before: NeedsYouItem | null,
    now: NeedsYouItem | null,
  ) => {
    if (!now || keyOf(now) === keyOf(before)) return;
    if (before && Date.parse(now.at) <= Date.parse(before.at)) return;
    out.push({ kind, item: now });
  };
  pick('review', prev.review.newest, next.review.newest);
  pick('request', prev.requests.newest, next.requests.newest);
  // An outage that was not in the previous answer.
  const before = new Set(providerAlertsOf(prev).map(alertKey));
  for (const alert of providerAlertsOf(next)) {
    if (before.has(alertKey(alert))) continue;
    out.push({
      kind: 'provider',
      alert,
      item: { id: alert.subject, title: alert.reason, from: '', at: alert.since },
    });
  }
  return out.sort((a, b) => Date.parse(b.item.at) - Date.parse(a.item.at));
}

/** The words for one arrival: its title and who it is from, never content. */
export function arrivalText(a: Arrival): { title: string; body: string; href: string } {
  if (a.kind === 'provider') {
    return { title: alertTitle(a.alert), body: alertHeadline(a.alert), href: alertHref(a.alert) };
  }
  const what = `"${a.item.title.trim() || 'Untitled'}"`;
  return a.kind === 'review'
    ? {
        title: 'Waiting for your review',
        body: `${a.item.from} sent ${what} for review`,
        href: reviewArrivalHref(a.item),
      }
    : { title: 'New team request', body: `${a.item.from}: ${what}`, href: REQUESTS_HREF };
}

/** Where a review arrival opens: the item in its own workspace when the
 *  brain names its kind (NeedsYouItem.type, brains with the workspace
 *  review), else /review, which finds it. */
export function reviewArrivalHref(item: NeedsYouItem & { type?: string }): string {
  return item.type
    ? reviewItemHref(item.type, item.id)
    : `${REVIEW_HREF}?item=${encodeURIComponent(item.id)}`;
}

const COUNT_PREFIX = /^\(\d+\+?\) /;

/** The tab title with the count in front ("(2) Jackdaw"), or without it. */
export function titleWithCount(title: string, count: number): string {
  const bare = title.replace(COUNT_PREFIX, '');
  if (count <= 0) return bare;
  return `(${count > 99 ? '99+' : count}) ${bare}`;
}
