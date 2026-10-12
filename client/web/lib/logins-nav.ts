/**
 * Settings > Users: what the detail pane shows, and links into it. Pure,
 * pinned by logins-nav.test.ts.
 *
 * The detail pane shows one of: a login (by id or email) or an open invite
 * (`invite:<id>`). A login opens on its details. There is no Chat view (W7c: each user reads
 * only their own chats), so an old `view=chat` link opens the details.
 *
 * Old links: the Clients steps (`what-clients-see`, `client-settings`, W5c)
 * and the Sign-in by email code entry (`email-code`, W8) are gone, so they
 * open the plain list.
 */

export const LOGINS_PATH = '/settings/users';

/** The Clients steps of the screen before W5c, and the Sign-in by email code
 *  entry before W8; an old link to one opens the plain list. */
const RETIRED_SELECTIONS = new Set(['what-clients-see', 'client-settings', 'email-code']);

const INVITE_PREFIX = 'invite:';

export const inviteKey = (inviteId: string) => `${INVITE_PREFIX}${inviteId}`;

/** The invite id in a selection key, else null. */
export function inviteIdOf(key: string | null | undefined): string | null {
  return key?.startsWith(INVITE_PREFIX) ? key.slice(INVITE_PREFIX.length) || null : null;
}

/** What a deep link selects at first: `selected` from the URL. A retired
 *  selection opens the plain list (nothing selected). */
export function initialSelection(selected: string | null | undefined): string | null {
  if (!selected || RETIRED_SELECTIONS.has(selected)) return null;
  return selected;
}

/** A link into Settings > Users: what to select. */
export function loginsHref(selected?: string | null): string {
  return selected ? `${LOGINS_PATH}?${new URLSearchParams({ selected }).toString()}` : LOGINS_PATH;
}
