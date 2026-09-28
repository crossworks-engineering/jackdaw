export * from '@mantle/client-types/lib/format-datetime';

import { formatDate } from '@mantle/client-types/lib/format-datetime';

/**
 * The "updated" stamp for list cards: full-word relative time while the edit
 * is fresh — "just now", "1 hour ago", "3 days ago" — and the plain date
 * (`formatDate`, en-GB) once it is 5 days old or more, where "4 months ago"
 * would only make the reader do the maths.
 *
 * Reads the clock, so client-rendered surfaces only — an SSR'd card would
 * hydrate against a different "now".
 */
export function updatedAgo(value: Date | string | number | null | undefined): string {
  if (value == null) return 'never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'never';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  const DAY = 86_400;
  if (seconds >= 5 * DAY) return formatDate(value);
  if (seconds < 60) return 'just now';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (seconds < 3600) return unit(Math.floor(seconds / 60), 'minute');
  if (seconds < DAY) return unit(Math.floor(seconds / 3600), 'hour');
  return unit(Math.floor(seconds / DAY), 'day');
}

/** Compact relative time for list rows ("4m", "3h", "2d", else a date).
 *  Reads the clock, so client-rendered surfaces only. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString();
}
