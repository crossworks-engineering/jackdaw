/**
 * Team admin > Clients > Sign-in codes by email (client logins C2b), the
 * pure half. An admin picks the email account client sign-in codes are
 * mailed from; none means codes are off (clients sign in with a link only).
 * Nothing here fetches, so each wording is pinned by a test
 * (client-signin-sender.test.ts).
 *
 * Server: GET and PUT /api/team-admin/clients/signin-sender, and (brains
 * with the audit fixes) GET …/signin-sender/preview?accountId=, which names
 * the folders a sender would leave out of mail sync before anything changes.
 */
import type {
  ClientSenderRefusedReason,
  ClientSigninSender,
  ClientSigninSenderPreview,
} from './contract-next';

export const CLIENT_SENDER_PATH = '/api/team-admin/clients/signin-sender';
export const CLIENT_SENDER_KEY = ['team-admin', 'client-signin-sender'] as const;

/** What picking `accountId` would do, asked before the change. */
export function senderPreviewPath(accountId: string): string {
  return `${CLIENT_SENDER_PATH}/preview?accountId=${encodeURIComponent(accountId)}`;
}

/** The select's value for "no sender": codes off. Not an account id (those
 *  are UUIDs), and never sent: it becomes `accountId: null`. */
export const NO_SENDER = 'none';

/** The PUT body for a select value. */
export function senderBody(value: string): { accountId: string | null } {
  return { accountId: value === NO_SENDER ? null : value };
}

/** The banner when no email worker serves the code queue on this box: the
 *  brain queues each request, and nothing ever mails it. */
export const EMAIL_WORKER_OFF_TEXT =
  'The email worker is not running on this box: codes are off. Clients sign in with a link you issue until it runs.';

/** True when this box cannot mail codes whatever the sender (a brain that
 *  does not say is taken at its word that it can). */
export function codesWorkerOff(s: Pick<ClientSigninSender, 'emailWorker'>): boolean {
  return s.emailWorker === false;
}

/** The line under the picker: where code mail goes, or that codes are off. */
export function senderStateText(
  s: Pick<ClientSigninSender, 'sender' | 'sentFoldersExcluded' | 'emailWorker'>,
) {
  if (!s.sender) return 'Codes are off. Clients sign in with a link you issue, and nothing else.';
  if (codesWorkerOff(s)) {
    return `Codes are off on this box (no email worker), though ${s.sender.address} is picked.`;
  }
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

/** The small count beside the picker: delivered codes against the cap,
 *  and what failed or was skipped at a limit, when the brain says (B3). A
 *  brain before the audit fixes counts failed sends as sent. */
export function sentCountText(
  s: Pick<
    ClientSigninSender,
    'sentLast24h' | 'dailyCap' | 'deliveredLast24h' | 'failedLast24h' | 'capSkipsLast24h'
  >,
) {
  if (s.deliveredLast24h === undefined) {
    return `${s.sentLast24h} of ${s.dailyCap} codes sent in the last 24 hours.`;
  }
  const parts = [`${s.deliveredLast24h} of ${s.dailyCap} codes delivered in the last 24 hours`];
  const failed = s.failedLast24h ?? 0;
  const skipped = s.capSkipsLast24h ?? 0;
  parts.push(failed === 1 ? '1 send failed' : `${failed} sends failed`);
  parts.push(
    skipped === 1 ? '1 request skipped at a limit' : `${skipped} requests skipped at a limit`,
  );
  return `${parts.join(', ')}.`;
}

/** The newest failed send, when there is one: when, and the mail server's
 *  reason. `when` formats the time (the card passes the app's format). */
export function lastFailureText(
  s: Pick<ClientSigninSender, 'lastFailure'>,
  when: (iso: string) => string,
): string | null {
  const f = s.lastFailure;
  if (!f) return null;
  const reason = f.reason.trim() || 'no reason given';
  return `Last failed send ${when(f.at)}: ${reason}`;
}

/** Why an account cannot be the sender, from the preview or a refusal. */
const REFUSED: Record<'no-sent-folder' | 'folders-unreadable' | 'account-cannot-send', string> = {
  'no-sent-folder':
    'That account has no sent-mail folder the brain can find, so a code mail could come back into the brain. Pick another account.',
  'folders-unreadable':
    'The folders of that account could not be read, so the brain cannot keep its sent mail out. Check it in Email accounts, then try again.',
  'account-cannot-send':
    'That account cannot send: it needs IMAP and SMTP, and to be enabled. Pick another, or fix it in Email accounts.',
};

/** The preview's answer: go ahead (with the folders to name), or refused. */
export type SenderPreviewOutcome =
  { kind: 'confirm'; folders: string[] } | { kind: 'refused'; message: string };

export function senderPreviewOutcome(p: ClientSigninSenderPreview): SenderPreviewOutcome {
  if (p.canUse) return { kind: 'confirm', folders: p.sentFolders };
  return { kind: 'refused', message: REFUSED[p.reason ?? 'no-sent-folder'] };
}

/** A sender change, before it is made: what the admin confirms. */
export type SenderChange =
  /** Codes from `address`; `folders` leave mail sync (null: this brain
   *  cannot say which, before the preview route). `restored`: the previous
   *  sender's folders, which come back. */
  | {
      kind: 'pick';
      accountId: string;
      address: string;
      folders: string[] | null;
      restored: string[];
    }
  /** Codes off; `restored` come back into mail sync. */
  | { kind: 'none'; restored: string[] };

const list = (folders: readonly string[]) => folders.join(', ');

/** The confirm dialog's words for a change. */
export function senderChangeConfirm(c: SenderChange): {
  title: string;
  body: string;
  action: string;
} {
  if (c.kind === 'none') {
    return {
      title: 'Turn sign-in codes off?',
      body:
        'Clients then sign in only with a link you issue.' +
        (c.restored.length ? ` These folders come back into mail sync: ${list(c.restored)}.` : ''),
      action: 'Turn codes off',
    };
  }
  const leaves =
    c.folders === null
      ? 'Its sent-mail folders are left out of mail sync, so the brain stops keeping the mail sent from it.'
      : c.folders.length
        ? `These folders are left out of mail sync, so the brain stops keeping the mail in them: ${list(c.folders)}.`
        : 'No folder is left out of mail sync.';
  return {
    title: `Send sign-in codes from ${c.address}?`,
    body:
      leaves +
      (c.restored.length ? ` These come back into mail sync: ${list(c.restored)}.` : '') +
      (c.folders?.length === 0 ? '' : ' Choosing None later brings them back.'),
    action: 'Use this account',
  };
}

/** The toast after a change, saying which folders came back. */
export function senderChangedText(
  next: Pick<ClientSigninSender, 'sender'>,
  restored: readonly string[],
): string {
  const back = restored.length ? ` ${list(restored)} came back into mail sync.` : '';
  return next.sender
    ? `Sign-in codes are sent from ${next.sender.address}.${back}`
    : `Sign-in codes are off.${back}`;
}

type Refusal = { reason?: unknown; error?: unknown } | undefined;

/** What the admin reads when a sender choice is refused. */
export function senderErrorText(status: number, body: Refusal): string {
  const reason = body?.reason as ClientSenderRefusedReason | undefined;
  switch (reason) {
    case 'account-not-found':
      return 'That email account is not in this brain any more. Pick another.';
    case 'account-cannot-send':
    case 'no-sent-folder':
    case 'folders-unreadable':
      return REFUSED[reason];
  }
  if (typeof body?.error === 'string' && body.error && status < 500) return body.error;
  return 'Could not save the sign-in sender. Try again.';
}
