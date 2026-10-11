/**
 * Settings > Users: what the detail pane shows, and links into it. Pure,
 * pinned by logins-nav.test.ts.
 *
 * The detail pane shows one of: a login (by id or email), an open invite
 * (`invite:<id>`), or the Sign-in by email code entry (`email-code`). A
 * login opens on its details, or on its Chat with `view=chat` when it has
 * one.
 *
 * Old links (W5c): the Clients steps (`what-clients-see`, `client-settings`)
 * are gone, so they open the plain list, details and not Chat.
 */

export const LOGINS_PATH = '/settings/users';

/** The Sign-in by email code entry in the list. */
export const EMAIL_CODE = 'email-code';

/** The Clients steps of the screen before W5c; an old link to one opens
 *  the plain list. */
const RETIRED_SELECTIONS = new Set(['what-clients-see', 'client-settings']);

const INVITE_PREFIX = 'invite:';

export const inviteKey = (inviteId: string) => `${INVITE_PREFIX}${inviteId}`;

/** The invite id in a selection key, else null. */
export function inviteIdOf(key: string | null | undefined): string | null {
  return key?.startsWith(INVITE_PREFIX) ? key.slice(INVITE_PREFIX.length) || null : null;
}

/** What a deep link selects at first: `selected` and `view` from the URL. A
 *  retired selection opens the plain list (nothing selected, no Chat). */
export function initialSelection(
  selected: string | null | undefined,
  view: string | null | undefined,
): { selected: string | null; chat: boolean } {
  if (!selected || RETIRED_SELECTIONS.has(selected)) return { selected: null, chat: false };
  return { selected, chat: view === 'chat' };
}

/** A link into Settings > Users: what to select, and the Chat view. */
export function loginsHref(selected?: string | null, opts: { chat?: boolean } = {}): string {
  const qs = new URLSearchParams();
  if (selected) qs.set('selected', selected);
  if (opts.chat) qs.set('view', 'chat');
  const s = qs.toString();
  return s ? `${LOGINS_PATH}?${s}` : LOGINS_PATH;
}

/** A login's Chat view. */
export const loginChatHref = (loginId: string) => loginsHref(loginId, { chat: true });
