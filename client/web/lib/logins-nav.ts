/**
 * Settings > Logins: where things are (2026-10-09, Team admin dissolving,
 * part 1). Invites, Clients, What clients see and each login's Chat moved
 * here from Team admin; the old Team admin links land here. Pure, pinned by
 * logins-nav.test.ts.
 *
 * The detail pane shows one of: a login (by id), an open invite
 * (`invite:<id>`), or one of the two client steps (`what-clients-see`, then
 * `client-settings`). A login opens on its details, or on its Chat with
 * `view=chat`.
 */

export const LOGINS_PATH = '/settings/users';

/** The two client steps in the Clients section, in order. */
export const WHAT_CLIENTS_SEE = 'what-clients-see';
export const CLIENT_SETTINGS = 'client-settings';

const INVITE_PREFIX = 'invite:';

export const inviteKey = (inviteId: string) => `${INVITE_PREFIX}${inviteId}`;

/** The invite id in a selection key, else null. */
export function inviteIdOf(key: string | null | undefined): string | null {
  return key?.startsWith(INVITE_PREFIX) ? key.slice(INVITE_PREFIX.length) || null : null;
}

/** A link into Settings > Logins: what to select, and the Chat view. */
export function loginsHref(selected?: string | null, opts: { chat?: boolean } = {}): string {
  const qs = new URLSearchParams();
  if (selected) qs.set('selected', selected);
  if (opts.chat) qs.set('view', 'chat');
  const s = qs.toString();
  return s ? `${LOGINS_PATH}?${s}` : LOGINS_PATH;
}

/** A login's Chat view. */
export const loginChatHref = (loginId: string) => loginsHref(loginId, { chat: true });

/**
 * Where an old Team admin link goes now, or null when it stays on Team admin.
 * Invites, Member chats, Clients and What clients see moved to Settings >
 * Logins; Chat archive was removed, so its links (the bare `?contact=` URL)
 * stay on Team admin, which opens on Review.
 */
export function movedTeamAdminHref(params: { view?: string; login?: string }): string | null {
  switch (params.view) {
    case 'invites':
      return LOGINS_PATH;
    case 'chats':
      return params.login ? loginChatHref(params.login) : LOGINS_PATH;
    case 'client-logins':
    case 'clients':
      return loginsHref(WHAT_CLIENTS_SEE);
    default:
      return null;
  }
}
