/**
 * Team admin > Clients > Sign-in codes by email (client logins C2b), the
 * pure half. An admin picks the email account client sign-in codes are
 * mailed from; none means codes are off (clients sign in with a link only).
 * Nothing here fetches, so each wording is pinned by a test
 * (client-signin-sender.test.ts).
 *
 * Server: GET and PUT /api/team-admin/clients/signin-sender.
 */
import type { ClientSenderRefusedReason, ClientSigninSender } from './contract-next';

export const CLIENT_SENDER_PATH = '/api/team-admin/clients/signin-sender';
export const CLIENT_SENDER_KEY = ['team-admin', 'client-signin-sender'] as const;

/** The select's value for "no sender": codes off. Not an account id (those
 *  are UUIDs), and never sent: it becomes `accountId: null`. */
export const NO_SENDER = 'none';

/** The PUT body for a select value. */
export function senderBody(value: string): { accountId: string | null } {
  return { accountId: value === NO_SENDER ? null : value };
}

/** The line under the picker: where code mail goes, or that codes are off. */
export function senderStateText(s: Pick<ClientSigninSender, 'sender' | 'sentFoldersExcluded'>) {
  if (!s.sender) return 'Codes are off. Clients sign in with a link you issue, and nothing else.';
  if (s.sentFoldersExcluded.length) {
    return `Sent mail from this account is kept out of the brain: ${s.sentFoldersExcluded.join(', ')}.`;
  }
  return 'Every code mail carries a marker, so mail sync keeps it out of the brain.';
}

/** The banner while the brain-wide daily cap is reached. */
export function capReachedText(dailyCap: number): string {
  return (
    `The daily limit of ${dailyCap} sign-in codes is reached. Requests are still ` +
    'accepted, but no code is sent until the window moves on.'
  );
}

/** The small count beside the picker. */
export function sentCountText(s: Pick<ClientSigninSender, 'sentLast24h' | 'dailyCap'>) {
  return `${s.sentLast24h} of ${s.dailyCap} codes sent in the last 24 hours.`;
}

type Refusal = { reason?: unknown; error?: unknown } | undefined;

/** What the admin reads when a sender choice is refused. */
export function senderErrorText(status: number, body: Refusal): string {
  switch (body?.reason as ClientSenderRefusedReason | undefined) {
    case 'account-not-found':
      return 'That email account is not in this brain any more. Pick another.';
    case 'account-cannot-send':
      return 'That account cannot send: it needs IMAP and SMTP, and to be enabled. Pick another, or fix it in Email accounts.';
  }
  if (typeof body?.error === 'string' && body.error && status < 500) return body.error;
  return 'Could not save the sign-in sender. Try again.';
}
