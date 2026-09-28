/**
 * Paging for a member login's OLD team portal chat (member logins Phase 6):
 * GET /api/team-admin/member-chats `selected.portalThread` is a window,
 * oldest first; `?portalBefore=<iso>` answers the window before it, and an
 * empty (or short) window means the start of the chat.
 */

type Dated = { id: string; createdAt: string };

/** The cursor for the next older page: the oldest message on screen. */
export function portalCursor(thread: readonly Dated[]): string | null {
  return thread[0]?.createdAt ?? null;
}

/** Has paging reached the first message? A window shorter than the server's
 *  window size is the last one. */
export function portalAtStart(page: readonly Dated[], windowSize: number): boolean {
  return page.length < windowSize;
}

/** Put an older page in front of what is on screen. A message already shown
 *  (a page boundary that shares a timestamp) is not repeated. */
export function prependOlder<T extends Dated>(older: readonly T[], shown: readonly T[]): T[] {
  const seen = new Set(shown.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...shown];
}
