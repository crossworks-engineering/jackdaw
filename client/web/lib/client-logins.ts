/**
 * Clients in Settings > Logins (client logins C2), the pure half. An admin adds a
 * CLIENT login (an email, or a contact), issues it a sign-in link and hands
 * the link over; the client opens it, types their email and is signed in
 * for 30 days. A client has no password. Nothing here fetches, so each
 * wording and each rule is pinned by a test (client-logins.test.ts).
 *
 * Server: /api/team-admin/clients and /api/team-admin/clients/:id/signin-link;
 * End sessions, Disable and Delete are the users routes (/api/users/:id).
 */
import type { ClientLoginList, ClientLoginRow } from '@mantle/client-types';
import type { ClientAdminRefusedReason } from '@mantle/client-types';

export const CLIENT_LOGINS_KEY = ['team-admin', 'client-logins'] as const;

/** How long a sign-in link lives, as the brain sets it. */
export const CLIENT_LINK_LIFETIME_HOURS = 72;

/**
 * Add client and Issue sign-in link wait for "What clients see" to be
 * checked (the brain refuses both with 409 `report-not-acknowledged` until
 * then): true while they must stay disabled. Unknown (still loading) counts
 * as not acknowledged.
 */
export function clientActionsBlocked(
  list: Pick<ClientLoginList, 'reportAcknowledged'> | undefined,
) {
  return list?.reportAcknowledged !== true;
}

/** Why the two actions are disabled, beside them. */
export const CLIENT_ACTIONS_BLOCKED_TEXT =
  'Check the list in What clients see first: every client login reads all of it.';

/** The full sign-in link to hand over: this app's origin plus the brain's
 *  `path` (`/client-signin#code=…`; `?code=…` from brains before the client
 *  logins audit fixes). */
export function clientSigninUrl(origin: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin.replace(/\/+$/, '')}${p}`;
}

type Refusal = { reason?: unknown; error?: unknown } | undefined;

/** The report went stale (or was never checked) between loading and acting. */
const NOT_ACKNOWLEDGED =
  'Check the list in What clients see first. Something may have gone to client since it was checked.';

/** What the admin reads when Add client is refused. */
export function clientCreateErrorText(status: number, body: Refusal): string {
  switch (body?.reason as ClientAdminRefusedReason | undefined) {
    case 'report-not-acknowledged':
      return NOT_ACKNOWLEDGED;
    case 'email-has-login':
      return 'Someone already signs in with that email. Find them in Settings > Logins.';
    case 'contact-has-login':
      return 'This contact already has a login. Find them in Settings > Logins.';
    case 'no-email':
      return 'This contact has no email address. Enter the email instead.';
    case 'contact-not-found':
      return 'That contact is not in this brain any more.';
    case 'email-not-on-contact':
      return 'That email is not on this contact. Leave it blank to use the contact’s email, or add it to the contact first.';
  }
  if (status === 400) return 'Enter a valid email address, or choose a contact.';
  if (typeof body?.error === 'string' && body.error) return body.error;
  return 'Could not add the client. Try again.';
}

/** What the admin reads when Issue sign-in link is refused. */
export function clientLinkErrorText(status: number, body: Refusal): string {
  if (body?.reason === 'report-not-acknowledged') return NOT_ACKNOWLEDGED;
  if (body?.reason === 'not-a-client' || status === 404) {
    return 'This login is not an active client login any more.';
  }
  if (typeof body?.error === 'string' && body.error && status < 500) return body.error;
  return 'Could not issue a sign-in link. Try again.';
}

/** The row's name: the display name, else the email. */
export function clientName(row: Pick<ClientLoginRow, 'displayName' | 'email'>): string {
  return row.displayName?.trim() || row.email;
}

/** The open link, if it is still open at `now` (the list may be older than
 *  the link's expiry). */
export function openLinkAt(row: Pick<ClientLoginRow, 'openLink'>, now: number) {
  const link = row.openLink;
  return link && Date.parse(link.expiresAt) > now ? link : null;
}

/** A row action that is confirmed first. `reissue`: Issue sign-in link while
 *  a link is still open (the new one revokes it). */
export type ClientConfirmKind = 'reissue' | 'revoke' | 'end' | 'disable' | 'delete';

/** What each confirm says. `openUntil`: the open link's expiry, formatted
 *  (reissue only). */
export function clientActionConfirm(
  kind: ClientConfirmKind,
  row: Pick<ClientLoginRow, 'displayName' | 'email'>,
  openUntil?: string,
): { title: string; body: string; action: string } {
  const name = clientName(row);
  switch (kind) {
    case 'reissue':
      return {
        title: `Issue a new sign-in link for ${name}?`,
        body:
          `Their open link${openUntil ? ` (open until ${openUntil})` : ''} stops working now, ` +
          'and the new one is shown once. Sessions they already have stay signed in.',
        action: 'Issue new link',
      };
    case 'revoke':
      return {
        title: `Revoke the sign-in link for ${name}?`,
        body: 'The link stops working now. Sessions it already started stay signed in; Sign out everywhere ends those.',
        action: 'Revoke',
      };
    case 'end':
      return {
        title: `End every session of ${name}?`,
        body:
          'They are signed out on every device at once, and any open sign-in link is revoked. ' +
          'They can still sign in again with a new link, or with an email code when codes are on. ' +
          'To keep them out, disable the login instead.',
        action: 'End sessions',
      };
    case 'disable':
      return {
        title: `Disable ${name}?`,
        body: 'They are signed out at once and cannot sign in, not even with a link, until you enable the login again.',
        action: 'Disable',
      };
    case 'delete':
      return {
        title: `Delete the client login for ${name}?`,
        // The brain deletes the client's chat thread (and any comments it
        // wrote before comments were removed) with the login (client tier
        // audit I5); Disable keeps them.
        body:
          'The login and its sign-in links are removed, every session ends, and the chat ' +
          'thread this client wrote is deleted. To keep their history, disable the login ' +
          'instead. This cannot be undone.',
        action: 'Delete',
      };
  }
}

/** What Settings > Logins says before it deletes a login: a client's words
 *  are the client delete's own (its chat goes with it), anyone
 *  else keeps everything they made. */
export function loginDeleteText(user: {
  role: string;
  displayName: string | null;
  email: string;
}): string {
  return user.role === 'client'
    ? clientActionConfirm('delete', user).body
    : 'Their login stops working immediately. Nothing in the brain is removed: everything they created stays, and their past actions remain in the audit log.';
}
