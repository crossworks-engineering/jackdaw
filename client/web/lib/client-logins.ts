/**
 * Team admin > Clients (client logins C2), the pure half. An admin adds a
 * CLIENT login (an email, or a contact), issues it a sign-in link and hands
 * the link over; the client opens it, types their email and is signed in
 * for 30 days. A client has no password. Nothing here fetches, so each
 * wording and each rule is pinned by a test (client-logins.test.ts).
 *
 * Server: /api/team-admin/clients and /api/team-admin/clients/:id/signin-link;
 * End sessions, Disable and Delete are the users routes (/api/users/:id).
 */
import type { ClientLoginList, ClientLoginRow } from './contract-next';

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
 *  `path` (`/client-signin?code=…`). */
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
  switch (body?.reason) {
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
