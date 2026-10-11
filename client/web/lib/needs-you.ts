/**
 * "Needs you": what waits for an admin (locked contacts, and embedding or
 * extraction outages), shared by the rail notice, the toast, the tab title
 * and favicon, the browser notification and the desktop dock. The numbers
 * come from the brain's count endpoint (GET /api/team-admin/needs-you), so
 * every window and device shows the same; the owner live stream sends
 * `needs_you` when they may have moved. Pure helpers only: no DOM here.
 *
 * W5c: review and team requests no longer count (workspaces replace the
 * review flow). The brain may still send `review` and `requests`; nothing
 * here reads them, except `requestsOpen` for Team admin until it goes.
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

export type { NeedsYou, NeedsYouItem };

export const NEEDS_YOU_KEY = ['needs-you'] as const;
/** The change type the owner live stream sends (mantle migration 0186). */
export const NEEDS_YOU_REALTIME_TYPE = 'needs_you';

/** Open team requests. Only Team admin reads it now (its Requests tab), and
 *  a later W5c part removes Team admin; nothing else counts requests. */
export const requestsOpen = (n: NeedsYou | null | undefined): number => (n ? n.requests.open : 0);

/** Contacts whose sharing locked after too many wrong codes (contact
 *  shares, brain migration 0214). A brain before 0214 sends no `sharing`. */
export const sharingLocked = (n: NeedsYou | null | undefined): number => n?.sharing?.locked ?? 0;

/** Embedding or extraction outages (brain migration 0230). */
export const providersFailing = (n: NeedsYou | null | undefined): number =>
  providerAlertsOf(n).length;

export const totalWaiting = (n: NeedsYou | null | undefined): number =>
  sharingLocked(n) + providersFailing(n);

/** The rail notice: "1 contact locked", or null when none is. Outages have
 *  their own red notice (provider-alert-banner.tsx). */
export function needsYouLabel(n: NeedsYou | null | undefined): string | null {
  const locked = sharingLocked(n);
  return locked > 0 ? `${locked} contact${locked === 1 ? '' : 's'} locked` : null;
}

/** Where the notice goes: the newest locked contact, else Contacts. */
export function needsYouHref(n: NeedsYou | null | undefined): string {
  const locked = n?.sharing?.newest;
  return locked ? `/contacts?id=${encodeURIComponent(locked.id)}` : '/contacts';
}

export type Arrival = { kind: 'provider'; item: NeedsYouItem; alert: ProviderAlert };

/**
 * What arrived between two answers, newest first: an outage that was not in
 * the previous answer. No previous answer (the first load) announces
 * nothing: only what arrives while you are here.
 */
export function arrivals(prev: NeedsYou | null, next: NeedsYou): Arrival[] {
  if (!prev) return [];
  const out: Arrival[] = [];
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

/** The words for one arrival: its title, the headline and the fix page. */
export function arrivalText(a: Arrival): { title: string; body: string; href: string } {
  return { title: alertTitle(a.alert), body: alertHeadline(a.alert), href: alertHref(a.alert) };
}

const COUNT_PREFIX = /^\(\d+\+?\) /;

/** The tab title with the count in front ("(2) Jackdaw"), or without it. */
export function titleWithCount(title: string, count: number): string {
  const bare = title.replace(COUNT_PREFIX, '');
  if (count <= 0) return bare;
  return `(${count > 99 ? '99+' : count}) ${bare}`;
}
