/**
 * "Needs you": what waits for an admin (Review submissions and open team
 * requests), shared by the rail notice, the toast, the tab title and
 * favicon, the browser notification and the desktop dock. The numbers come
 * from the brain's count endpoint (GET /api/team-admin/needs-you), so every
 * window and device shows the same; the owner live stream sends
 * `needs_you` when they may have moved. Pure helpers only: no DOM here.
 */
import type { NeedsYou, NeedsYouItem } from '@mantle/client-types';

export type { NeedsYou, NeedsYouItem };

export const NEEDS_YOU_KEY = ['needs-you'] as const;
/** The change type the owner live stream sends (mantle migration 0186). */
export const NEEDS_YOU_REALTIME_TYPE = 'needs_you';

export const REVIEW_HREF = '/team-admin?view=review';
export const REQUESTS_HREF = '/team-admin?view=requests';

/** Submitted items only, as the Review tab badge always counted: what
 *  deactivated logins left behind is not urgent (it stays in the list). The
 *  rail, the tab badge and the dock all count this. */
export const reviewWaiting = (n: NeedsYou | null | undefined): number =>
  n ? n.review.submitted : 0;

export const requestsOpen = (n: NeedsYou | null | undefined): number => (n ? n.requests.open : 0);

/** Contacts whose sharing locked after too many wrong codes (contact
 *  shares, brain migration 0214). A brain before 0214 sends no `sharing`. */
export const sharingLocked = (n: NeedsYou | null | undefined): number => n?.sharing?.locked ?? 0;

export const totalWaiting = (n: NeedsYou | null | undefined): number =>
  reviewWaiting(n) + requestsOpen(n) + sharingLocked(n);

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

export type Arrival = { kind: 'review' | 'request'; item: NeedsYouItem };

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
  const pick = (kind: Arrival['kind'], before: NeedsYouItem | null, now: NeedsYouItem | null) => {
    if (!now || keyOf(now) === keyOf(before)) return;
    if (before && Date.parse(now.at) <= Date.parse(before.at)) return;
    out.push({ kind, item: now });
  };
  pick('review', prev.review.newest, next.review.newest);
  pick('request', prev.requests.newest, next.requests.newest);
  return out.sort((a, b) => Date.parse(b.item.at) - Date.parse(a.item.at));
}

/** The words for one arrival: its title and who it is from, never content. */
export function arrivalText(a: Arrival): { title: string; body: string; href: string } {
  const what = `"${a.item.title.trim() || 'Untitled'}"`;
  return a.kind === 'review'
    ? {
        title: 'Waiting for your review',
        body: `${a.item.from} sent ${what} for review`,
        href: `${REVIEW_HREF}&item=${encodeURIComponent(a.item.id)}`,
      }
    : { title: 'New team request', body: `${a.item.from}: ${what}`, href: REQUESTS_HREF };
}

const COUNT_PREFIX = /^\(\d+\+?\) /;

/** The tab title with the count in front ("(2) Jackdaw"), or without it. */
export function titleWithCount(title: string, count: number): string {
  const bare = title.replace(COUNT_PREFIX, '');
  if (count <= 0) return bare;
  return `(${count > 99 ? '99+' : count}) ${bare}`;
}
